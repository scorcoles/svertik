<script lang="ts">
  import type { ModifierInstance, SceneNode } from '@svertik/engine';
  import { IconButton, StackItem, type IconName } from '@svertik/ui';
  import { canNest, locateModifier, locateNode, registry, type Editor } from './editor.svelte';

  let { editor }: { editor: Editor } = $props();

  // Tree keyboard: ↑↓ move to the previous/next visible row and select it (as in a layers panel);
  // Home/End jump to the first/last. ⌥↑↓ is left to the editor (it reorders).
  // Type-ahead (ARIA tree pattern): typing letters jumps to the next visible row whose name starts with
  // them. While a row has focus, letters search the tree instead of reaching the editor's shortcuts.
  let typed = '';
  let typedTimer: ReturnType<typeof setTimeout> | undefined;
  function typeAhead(e: KeyboardEvent, row: HTMLElement, items: HTMLElement[]) {
    clearTimeout(typedTimer);
    typedTimer = setTimeout(() => (typed = ''), 600);
    typed += e.key.toLowerCase();
    const start = items.indexOf(row);
    // A single repeated letter cycles through the rows starting with it.
    const query = [...typed].every((c) => c === typed[0]) ? typed[0]! : typed;
    const from = query.length === 1 ? start + 1 : start;
    const order = [...items.slice(from), ...items.slice(0, from)];
    const next = order.find((el) => (el.dataset.label ?? '').toLowerCase().startsWith(query));
    if (next && next !== row) {
      next.click();
      next.focus();
    }
  }

  function treeKey(e: KeyboardEvent) {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]');
    if (!rows || !row || e.target !== row || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key.length === 1 && /\S/.test(e.key) && e.key !== '/') {
      e.preventDefault();
      e.stopPropagation();
      typeAhead(e, row, [...rows.querySelectorAll<HTMLElement>('[role="treeitem"]')]);
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    const items = [...rows.querySelectorAll<HTMLElement>('[role="treeitem"]')];
    const i = items.indexOf(row);
    const next = e.key === 'Home' ? items[0] : e.key === 'End' ? items[items.length - 1] : items[i + (e.key === 'ArrowUp' ? -1 : 1)];
    e.preventDefault();
    if (!next || next === row) return;
    next.click();
    next.focus();
  }

  // Keep the selection (including what was just added) in view in the stack.
  let rows = $state<HTMLElement>();
  $effect(() => {
    void editor.selected;
    queueMicrotask(() => rows?.querySelector('[data-selected]')?.scrollIntoView({ block: 'nearest' }));
  });

  // While the command line is open: where the effect it would add lands (a line under the row it goes
  // after, or an outline round the container it goes into). Uses the same rule as editor.add.
  const lastVisible = (m: ModifierInstance): string => {
    while (m.children?.length && !editor.isCollapsed(m.id)) m = m.children[m.children.length - 1]!;
    return m.id;
  };
  const insert = $derived.by((): { id: string; where: 'after' | 'inside' } | null => {
    const type = editor.commandPreview;
    const spot = type ? editor.insertion(type) : null;
    if (!spot) return null;
    if (spot.where === 'inside') return { id: spot.at!.inst.id, where: 'inside' };
    if (spot.where === 'after') return { id: lastVisible(spot.at!.inst), where: 'after' };
    const last = spot.owner.stack[spot.owner.stack.length - 1];
    if (!last || spot.owner.locked || editor.isCollapsed(spot.owner.id)) return { id: spot.owner.id, where: spot.owner.stack.length ? 'inside' : 'after' };
    return { id: lastVisible(last), where: 'after' };
  });
  $effect(() => {
    if (!insert) return;
    queueMicrotask(() => rows?.querySelector('[data-insert]')?.scrollIntoView({ block: 'nearest' }));
  });

  // Arrastrar: antes o después de una fila, o dentro (tercio central de un Step o de un grupo).
  type Where = 'before' | 'after' | 'inside';
  let drag = $state<{ id: string; kind: 'node' | 'modifier' } | null>(null);
  let drop = $state<{ id: string; where: Where } | null>(null);

  const zone = (e: DragEvent, canNest: boolean): Where => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    return canNest && y > 0.25 && y < 0.75 ? 'inside' : y < 0.5 ? 'before' : 'after';
  };

  function overModifier(e: DragEvent, m: ModifierInstance) {
    if (!drag || drag.kind !== 'modifier' || drag.id === m.id || !editor.scene) return;
    // Los efectos se mueven a cualquier pila, también la de otro objeto; con ⇧, se copian.
    const from = locateModifier(editor.scene, drag.id);
    const to = locateModifier(editor.scene, m.id);
    if (!from || !to) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = e.shiftKey ? 'copy' : 'move';
    drop = { id: m.id, where: zone(e, canNest(m.type, from.inst.type)) };
  }

  function overNode(e: DragEvent, n: SceneNode) {
    if (editor.isLocked(n.id)) {
      drop = null;
      return;
    }
    // Un efecto soltado sobre un objeto va al final de su pila.
    if (drag?.kind === 'modifier') {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = e.shiftKey ? 'copy' : 'move';
      drop = { id: n.id, where: 'inside' };
      return;
    }
    if (!drag || drag.kind !== 'node' || drag.id === n.id) return;
    e.preventDefault();
    e.stopPropagation();
    drop = { id: n.id, where: zone(e, n.kind !== 'effector' && !(n.kind === 'group' && n.composition)) };
  }

  function dropHere(e?: DragEvent) {
    if (!editor.scene || !drag || !drop) return;
    const copy = !!e?.shiftKey;
    if (drag.kind === 'modifier') {
      const target = locateModifier(editor.scene, drop.id);
      if (target) {
        if (drop.where === 'inside') editor.moveTo(drag.id, target.inst.id, target.inst.children?.length ?? 0, target.owner.id, copy);
        else editor.moveTo(drag.id, target.parent?.id ?? null, target.index + (drop.where === 'after' ? 1 : 0), target.owner.id, copy);
      } else {
        // Sobre un objeto: al final de su pila.
        const node = locateNode(editor.scene.objects, drop.id)?.node;
        if (node) editor.moveTo(drag.id, null, node.stack.length, node.id, copy);
      }
    } else {
      const target = locateNode(editor.scene.objects, drop.id);
      if (target) {
        if (drop.where === 'inside' && target.node.kind !== 'effector') editor.moveNode(drag.id, target.node.id, target.node.children?.length ?? 0);
        else editor.moveNode(drag.id, target.parent?.id ?? null, target.index + (drop.where === 'after' ? 1 : 0));
      }
    }
    drag = null;
    drop = null;
  }

  const end = () => {
    drag = null;
    drop = null;
  };
</script>

{#snippet modifiers(list: ModifierInstance[], depth: number)}
  {#each list as m (m.id)}
    {@const open = !editor.isCollapsed(m.id)}
    <div
      class="drag"
      draggable="true"
      data-drop={drop?.id === m.id ? drop.where : undefined}
      data-insert={insert?.id === m.id ? insert.where : undefined}
      ondragstart={(e) => { e.stopPropagation(); drag = { id: m.id, kind: 'modifier' }; e.dataTransfer?.setData('text/plain', m.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copyMove'; }}
      ondragover={(e) => overModifier(e, m)}
      ondrop={(e) => { e.stopPropagation(); dropHere(e); }}
      ondragend={end}
      role="none"
    >
      <StackItem
        label={m.name || (registry.get(m.type)?.label ?? m.type)}
        kind={registry.get(m.type)?.kind}
        icon={m.type as IconName}
        {depth}
        expanded={m.children ? open : undefined}
        onexpand={(v) => editor.toggleCollapsed(m.id, v)}
        selected={editor.selected === m.id}
        enabled={m.enabled !== false}
        onselect={() => (editor.selected = m.id)}
        ontoggle={(v) => editor.setEnabled(m.id, v)}
        onremove={() => editor.remove(m.id)}
        onrename={(name) => editor.renameModifier(m.id, name)}
      />
    </div>
    {#if m.children && open}
      {@render modifiers(m.children, depth + 1)}
      {#if m.children.length === 0 && editor.showInfo}
        <p class="empty" style:--depth={depth + 1}>Drop or add a modifier here</p>
      {/if}
    {/if}
  {/each}
{/snippet}

{#snippet nodes(list: SceneNode[], depth: number)}
  {#each list as n (n.id)}
    {@const open = !n.locked && !editor.isCollapsed(n.id)}
    <!-- A branch holds an object and everything under it, so the object's row can stick to the top while
         its modifiers scroll (the context isn't lost in a long stack). Nested objects stick below. -->
    <div class="branch" role="none" style:--depth={depth}>
    <div
      class="drag node"
      class:hidden-node={n.visible === false}
      draggable={!editor.isLocked(n.id)}
      data-drop={drop?.id === n.id ? drop.where : undefined}
      data-insert={insert?.id === n.id ? insert.where : undefined}
      ondragstart={(e) => { e.stopPropagation(); drag = { id: n.id, kind: 'node' }; e.dataTransfer?.setData('text/plain', n.id); }}
      ondragover={(e) => overNode(e, n)}
      ondrop={(e) => { e.stopPropagation(); dropHere(e); }}
      ondragend={end}
      role="none"
    >
      <StackItem
        label={n.name}
        kind="object"
        icon={(n.kind === 'group' ? n.composition ? 'composition' : 'group' : n.kind === 'shape' ? n.shape : n.kind === 'instance' ? 'instance' : n.kind === 'effector' ? 'effector' : n.packed ? 'pack' : /<image\b/i.test(n.source) ? 'image' : 'object') as IconName}
        oniconactivate={!n.locked && n.kind === 'group' && n.composition ? () => editor.openComposition(n.id) : undefined}
        {depth}
        expanded={!n.locked && (n.stack.length || n.kind === 'group' || n.children?.length) ? open : undefined}
        selected={editor.isSelected(n.id)}
        onselect={(e) => { if (!editor.isLocked(n.id)) e.shiftKey || e.metaKey || e.ctrlKey ? editor.toggleSelect(n.id) : (editor.selected = n.id); }}
        onexpand={(v) => editor.toggleCollapsed(n.id, v)}
        onremove={n.locked ? undefined : () => editor.remove(n.id)}
        visible={n.visible !== false}
        onvisible={n.locked ? undefined : (v) => editor.setNode(n.id, 'visible', v, true)}
        onungroup={!n.locked && n.kind === 'group' && !n.composition ? () => editor.ungroup(n.id) : undefined}
        onrename={n.locked ? undefined : (name) => editor.setNode(n.id, 'name', name, true)}
        locked={!!n.locked}
        onlock={() => editor.toggleLock(n.id)}
        tabbable={editor.isSelected(n.id) || (!editor.selected && n.id === editor.scene?.objects[0]?.id)}
      />
    </div>
    {#if open}
      {@render modifiers(n.stack, depth + 1)}
      {#if n.children?.length && !(n.kind === 'group' && n.composition)}{@render nodes(n.children, depth + 1)}{/if}
    {/if}
    </div>
  {/each}
{/snippet}

<section class="stack" aria-label="Stack">
  <header>
    {#if editor.scene}<span class="count">{editor.objectCount} {editor.objectCount === 1 ? 'object' : 'objects'}</span>{/if}
    <span class="spacer" aria-hidden="true"></span>
    <IconButton icon="expand-all" label="Expand all" disabled={!editor.scene} onclick={() => editor.setAllCollapsed(false)} />
    <IconButton icon="collapse-all" label="Collapse all" disabled={!editor.scene} onclick={() => editor.setAllCollapsed(true)} />
    <IconButton
      icon={editor.packed ? 'unpack' : 'pack'}
      label={editor.packed ? 'Unpack' : 'Pack (freeze the result)'}
      disabled={!editor.activeNode}
      onclick={() => (editor.packed ? editor.unpack() : editor.pack())}
    />
    <IconButton icon="group" label="Group (⌘G)" disabled={!editor.activeNode} onclick={() => editor.group()} />
    <!-- Add: opens the command line with "add " typed (every effect is there, searchable). -->
    <IconButton icon="plus" label="Add modifier (/)" disabled={!editor.scene} onclick={() => editor.openCommand('add ')} />
  </header>
  {#if editor.scene}
    <div class="rows" role="tree" aria-label="Objects and modifiers" tabindex="-1" bind:this={rows} onkeydown={treeKey}>
      {@render nodes(editor.scene.objects, 0)}
    </div>
  {:else}
    {#if editor.showInfo}<div class="hint">
      <p>No source yet.</p>
      <p class="dim">Draw, import or open a demo to start stacking&nbsp;modifiers.</p>
    </div>{/if}
  {/if}
</section>

<style>
  /* Max height comes from the inspector's divider (--stack-share); a short stack takes only what it needs. */
  .stack { display: flex; flex-direction: column; min-height: 0; max-height: var(--stack-share, 50%); padding-bottom: var(--sv-space-4); }
  header { display: flex; align-items: center; gap: var(--sv-space-4); height: 28px; padding: 0 var(--sv-space-4) 0 var(--sv-space-8); flex: none; }
  .spacer { flex: 1; }
  .count { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); margin-right: var(--sv-space-4); }
  .rows { overflow-y: auto; scroll-padding-top: var(--sv-size-row); }
  .drag { position: relative; }
  .drag.node { position: sticky; top: calc(var(--depth) * var(--sv-size-row)); z-index: calc(10 - var(--depth)); background: var(--sv-surface-panel); }
  .hidden-node { opacity: 0.45; }
  .drag[data-drop='before']::after,
  .drag[data-drop='after']::after { content: ''; position: absolute; left: 0; right: 0; height: 2px; background: var(--sv-accent-fill); z-index: 1; }
  .drag[data-drop='before']::after { top: -1px; }
  .drag[data-drop='after']::after { bottom: -1px; }
  /* Command line preview: same marks as a drop, on ::before so a drag in progress still shows its own. */
  .drag[data-insert='after']::before { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--sv-accent-fill); z-index: 1; pointer-events: none; }
  .drag[data-insert='inside'] { outline: 1px dashed var(--sv-accent-fill); outline-offset: -1px; }
  .drag[data-drop='inside'] { outline: 1px solid var(--sv-accent-fill); outline-offset: -1px; }
  .empty {
    margin: 0;
    height: 22px;
    display: flex;
    align-items: center;
    padding-left: calc(var(--sv-space-4) + var(--depth) * var(--sv-space-12) + 16px);
    color: var(--sv-text-muted);
    font-size: var(--sv-font-size-10);
  }
  .hint { margin: 0; padding: var(--sv-space-4) var(--sv-space-8); color: var(--sv-text-muted); }
  .hint p { margin: 0 0 var(--sv-space-4); }
  .dim { color: var(--sv-text-muted); font-size: var(--sv-font-size-11); }
</style>
