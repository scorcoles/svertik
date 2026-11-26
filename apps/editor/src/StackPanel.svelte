<script lang="ts">
  import { t } from '@svertik/ui';
  import type { ModifierInstance, SceneNode } from '@svertik/engine';
  import { IconButton, StackItem, type IconName } from '@svertik/ui';
  import { tick } from 'svelte';
  import { canNest, locateModifier, locateNode, registry, selectors, signalEffectors, type Editor } from './editor.svelte';
  import PanelHeader from './PanelHeader.svelte';
  import { categoryOf, familyColor } from './command';

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

  const i_isLast = (row: HTMLElement) => {
    const items = rows?.querySelectorAll<HTMLElement>('[role="treeitem"]');
    return !!items && items[items.length - 1] === row;
  };

  function treeKey(e: KeyboardEvent) {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]');
    if (!rows || !row || e.target !== row || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key.length === 1 && /\S/.test(e.key) && e.key !== '/') {
      e.preventDefault();
      e.stopPropagation();
      if (more) {
        // Draw the rest first, then search (rows are created on the next tick).
        showAll();
        void tick().then(() => rows && typeAhead(e, row, [...rows.querySelectorAll<HTMLElement>('[role="treeitem"]')]));
        return;
      }
      typeAhead(e, row, [...rows.querySelectorAll<HTMLElement>('[role="treeitem"]')]);
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    if (e.key === 'End' && more) {
      e.preventDefault();
      showAll();
      void tick().then(() => {
        const last = [...(rows?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])].pop();
        last?.click();
        last?.focus();
      });
      return;
    }
    if (e.key === 'ArrowDown' && more && i_isLast(row)) shown += CHUNK;
    const items = [...rows.querySelectorAll<HTMLElement>('[role="treeitem"]')];
    const i = items.indexOf(row);
    const next = e.key === 'Home' ? items[0] : e.key === 'End' ? items[items.length - 1] : items[i + (e.key === 'ArrowUp' ? -1 : 1)];
    e.preventDefault();
    if (!next || next === row) return;
    next.click();
    next.focus();
  }

  // Long scenes: the top-level objects are drawn in batches of CHUNK as the list scrolls near its end
  // (building a thousand rows up front cost about half a second). Selecting something further down, or
  // Home/End and type-ahead, first extend the batch to reach it.
  const CHUNK = 80;
  let shown = $state(CHUNK);
  let lastScene: unknown = null;
  $effect(() => {
    // A new document starts from the first batch again.
    if (editor.scene !== lastScene) (lastScene = editor.scene), (shown = CHUNK);
  });
  // With layers, the stack lists the active layer's objects.
  const top = $derived(editor.scene ? editor.root.slice(0, shown) : []);
  const more = $derived(editor.scene ? editor.root.length - top.length : 0);
  const holds = (n: SceneNode, id: string): boolean =>
    n.id === id || stackHolds(n.stack, id) || (n.children ?? []).some((c) => holds(c, id));
  const stackHolds = (list: ModifierInstance[], id: string): boolean => list.some((m) => m.id === id || stackHolds(m.children ?? [], id));
  $effect(() => {
    const id = editor.selected;
    const objects = editor.scene ? editor.root : undefined;
    if (!id || !objects || objects.length <= shown) return;
    const at = objects.findIndex((n) => holds(n, id));
    if (at >= shown) shown = at + CHUNK;
  });
  let sentinel = $state<HTMLElement>();
  $effect(() => {
    if (!sentinel || !rows) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) shown += CHUNK; }, { root: rows, rootMargin: '200px' });
    io.observe(sentinel);
    return () => io.disconnect();
  });
  /** Draws every row (for Home/End and type-ahead, which must see the whole list). */
  const showAll = () => {
    if (editor.scene && shown < editor.root.length) shown = editor.root.length;
  };

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

  // Dragging: before or after a row, or inside (the middle third of a Step or a group).
  type Where = 'before' | 'after' | 'inside';
  let drag = $state<{ id: string; kind: 'node' | 'modifier' } | null>(null);
  let drop = $state<{ id: string; where: Where } | null>(null);
  let invalidDrop = $state<string | null>(null);

  const zone = (e: DragEvent): Where => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    return y > 0.25 && y < 0.75 ? 'inside' : y < 0.5 ? 'before' : 'after';
  };

  function overModifier(e: DragEvent, m: ModifierInstance) {
    if (!drag || drag.kind !== 'modifier' || drag.id === m.id || !editor.scene) return;
    // Effects move to any stack, also another object's; with ⇧, they are copied.
    const from = locateModifier(editor.scene, drag.id);
    const to = locateModifier(editor.scene, m.id);
    if (!from || !to) return;
    // Selector → time-signal nesting is the useful drop action across the whole row;
    // reserving a tiny central strip made the valid destination hard to discover.
    const where = selectors.has(m.type) && signalEffectors.has(from.inst.type) ? 'inside' : zone(e);
    if (where === 'inside' && !canNest(m.type, from.inst.type)) {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
      drop = null;
      invalidDrop = m.id;
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = e.shiftKey ? 'copy' : 'move';
    invalidDrop = null;
    drop = { id: m.id, where };
  }

  function overNode(e: DragEvent, n: SceneNode) {
    if (editor.isLocked(n.id)) {
      drop = null;
      invalidDrop = null;
      return;
    }
    // An effect dropped on an object goes to the end of its stack.
    if (drag?.kind === 'modifier') {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = e.shiftKey ? 'copy' : 'move';
      invalidDrop = null;
      drop = { id: n.id, where: 'inside' };
      return;
    }
    if (!drag || drag.kind !== 'node' || drag.id === n.id) return;
    e.preventDefault();
    e.stopPropagation();
    const where = zone(e);
    if (where === 'inside' && (n.kind === 'effector' || (n.kind === 'group' && n.composition))) {
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
      drop = null;
      invalidDrop = n.id;
      return;
    }
    invalidDrop = null;
    drop = { id: n.id, where };
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
        // On an object: at the end of its stack.
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
    invalidDrop = null;
  }

  const end = () => {
    drag = null;
    drop = null;
    invalidDrop = null;
  };
</script>

{#snippet modifiers(list: ModifierInstance[], depth: number)}
  {#each list as m (m.id)}
    {@const open = !editor.isCollapsed(m.id)}
    <div
      class="drag"
      data-drop={drop?.id === m.id ? drop.where : undefined}
      data-drop-invalid={invalidDrop === m.id ? true : undefined}
      data-insert={insert?.id === m.id ? insert.where : undefined}
      ondragover={(e) => overModifier(e, m)}
      ondrop={(e) => { e.stopPropagation(); dropHere(e); }}
      ondragend={end}
      role="none"
    >
      <StackItem
        label={m.name || (registry.get(m.type)?.label ?? m.type)}
        kind={registry.get(m.type)?.kind}
        icon={m.type as IconName}
        tone={familyColor(categoryOf(registry.get(m.type) ?? { type: m.type }))}
        {depth}
        expanded={m.children ? open : undefined}
        onexpand={(v) => editor.toggleCollapsed(m.id, v)}
        selected={editor.selected === m.id}
        enabled={m.enabled !== false}
        onselect={() => (editor.selected = m.id)}
        ontoggle={(v) => editor.setEnabled(m.id, v)}
        onremove={() => editor.remove(m.id)}
        onrename={(name) => editor.renameModifier(m.id, name)}
        ondragstart={(e) => { drag = { id: m.id, kind: 'modifier' }; e.dataTransfer?.setData('text/plain', m.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copyMove'; }}
      />
    </div>
    {#if m.children && open}
      {@render modifiers(m.children, depth + 1)}
      {#if m.children.length === 0 && editor.showInfo}
        <p class="empty" style:--depth={depth + 1}>{t('Drop or add a modifier here')}</p>
      {/if}
    {/if}
  {/each}
{/snippet}

{#snippet nodes(list: SceneNode[], depth: number, lockedAbove = false)}
  {#each list as n (n.id)}
    {@const open = !n.locked && !editor.isCollapsed(n.id)}
    <!-- Locked here or by an ancestor, passed down the tree (asking the editor per row walked the whole scene each time). -->
    {@const locked = lockedAbove || !!n.locked}
    <!-- A branch holds an object and everything under it, so the object's row can stick to the top while
         its modifiers scroll (the context isn't lost in a long stack). Nested objects stick below. -->
    <div class="branch" role="none" style:--depth={depth}>
    <div
      class="drag node"
      class:hidden-node={n.visible === false}
      data-drop={drop?.id === n.id ? drop.where : undefined}
      data-drop-invalid={invalidDrop === n.id ? true : undefined}
      data-insert={insert?.id === n.id ? insert.where : undefined}
      ondragover={(e) => overNode(e, n)}
      ondrop={(e) => { e.stopPropagation(); dropHere(e); }}
      ondragend={end}
      role="none"
    >
      <StackItem
        label={n.name}
        kind="object"
        icon={(n.kind === 'group' ? n.composition ? 'composition' : 'group' : n.kind === 'shape' ? n.shape : n.kind === 'instance' ? n.mouse ? 'mouse-instance' : 'instance' : n.kind === 'effector' ? 'effector' : n.packed ? 'pack' : /<image\b/i.test(n.source) ? 'image' : 'object') as IconName}
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
        tabbable={editor.isSelected(n.id) || (!editor.selected && n.id === editor.root[0]?.id)}
        ondragstart={locked ? undefined : (e) => { drag = { id: n.id, kind: 'node' }; e.dataTransfer?.setData('text/plain', n.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; }}
      />
    </div>
    {#if open}
      {@render modifiers(n.stack, depth + 1)}
      {#if n.children?.length && !(n.kind === 'group' && n.composition)}{@render nodes(n.children, depth + 1, locked)}{/if}
    {/if}
    </div>
  {/each}
{/snippet}

<section class="stack" aria-label={t('Stack')} class:folded={!editor.stackOpen}>
  <PanelHeader title={t('Stack')} open={editor.stackOpen} ontoggle={(v) => (editor.stackOpen = v)} controls="stack-rows" detail={editor.scene ? `${editor.objectCount} ${editor.objectCount === 1 ? 'object' : 'objects'}` : undefined}>
    <IconButton icon="expand-all" label={t('Expand all')} disabled={!editor.scene} onclick={() => editor.setAllCollapsed(false)} />
    <IconButton icon="collapse-all" label={t('Collapse all')} disabled={!editor.scene} onclick={() => editor.setAllCollapsed(true)} />
    <IconButton
      icon={editor.packed ? 'unpack' : 'pack'}
      label={editor.packed ? t('Unpack') : t('Pack (freeze the result)')}
      disabled={!editor.activeNode}
      onclick={() => (editor.packed ? editor.unpack() : editor.pack())}
    />
    <IconButton icon="group" label={t('Group (⌘G)')} disabled={!editor.activeNode} onclick={() => editor.group()} />
    <!-- Add: opens the command line with "add " typed (every effect is there, searchable). -->
    <IconButton icon="plus" label={t('Add modifier (/)')} disabled={!editor.scene} onclick={() => editor.openCommand('add ')} />
  </PanelHeader>
  {#if !editor.stackOpen}
    <!-- Folded: only the header. -->
  {:else if editor.scene}
    <div id="stack-rows" class="rows" role="tree" aria-label={t('Objects and modifiers')} tabindex="-1" bind:this={rows} onkeydown={treeKey}>
      {@render nodes(top, 0)}
      {#if more}
        <p class="more" bind:this={sentinel}>{more === 1 ? t('1 more object…') : t('{count} more objects…', { count: more })}</p>
      {/if}
    </div>
  {:else}
    {#if editor.showInfo}<div class="hint">
      <p>{t('No source yet.')}</p>
      <p class="dim">{t('Draw, import or open a demo to start stacking modifiers.')}</p>
    </div>{/if}
  {/if}
</section>

<style>
  /* Max height comes from the inspector's divider (--stack-share); a short stack takes only what it needs. */
  .stack { display: flex; flex-direction: column; min-height: 0; max-height: var(--stack-share, 50%); padding-bottom: var(--sv-space-4); }
  .stack.folded { padding-bottom: 0; }
  .more { margin: 0; padding: var(--sv-space-6) var(--sv-space-8); color: var(--sv-text-muted); font-size: var(--sv-font-size-11); }
  .rows { overflow-y: auto; scroll-padding-top: var(--sv-size-row); }
  .drag { position: relative; }
  .drag.node { position: sticky; top: calc(var(--depth) * var(--sv-size-row)); z-index: calc(10 - var(--depth)); background: var(--sv-surface-panel); }
  /* Dim what the row shows, not the row: it sticks to the top, and a translucent background would let
     the rows scrolling under it show through. The eye stays clear, to turn it back on. */
  .hidden-node :global(.sv-stack-item > :not(.eye)) { opacity: 0.45; }
  .drag[data-drop='before']::after,
  .drag[data-drop='after']::after { content: ''; position: absolute; left: 0; right: 0; height: 2px; background: var(--sv-accent-fill); z-index: 1; }
  .drag[data-drop='before']::after { top: -1px; }
  .drag[data-drop='after']::after { bottom: -1px; }
  /* Command line preview: same marks as a drop, on ::before so a drag in progress still shows its own. */
  .drag[data-insert='after']::before { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--sv-accent-fill); z-index: 1; pointer-events: none; }
  .drag[data-insert='inside'] { outline: 1px dashed var(--sv-accent-text); outline-offset: -1px; }
  .drag[data-drop='inside'] { outline: 2px solid var(--sv-accent-text); outline-offset: -2px; }
  .drag[data-drop-invalid] { outline: 1px dashed var(--sv-signal-error); outline-offset: -1px; }
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
