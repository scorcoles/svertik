<script lang="ts">
  import type { ModifierInstance, SceneNode } from '@svertik/engine';
  import { IconButton, StackItem, type IconName } from '@svertik/ui';
  import AddMenu from './AddMenu.svelte';
  import { containers, locateModifier, locateNode, registry, type Editor } from './editor.svelte';

  let { editor }: { editor: Editor } = $props();

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
    // Los efectos se mueven dentro de la pila de su nodo.
    const from = locateModifier(editor.scene, drag.id);
    const to = locateModifier(editor.scene, m.id);
    if (!from || !to || from.owner.id !== to.owner.id) return;
    e.preventDefault();
    e.stopPropagation();
    drop = { id: m.id, where: zone(e, containers.has(m.type) && !containers.has(from.inst.type)) };
  }

  function overNode(e: DragEvent, n: SceneNode) {
    if (!drag || drag.kind !== 'node' || drag.id === n.id) return;
    e.preventDefault();
    e.stopPropagation();
    drop = { id: n.id, where: zone(e, n.kind === 'group') };
  }

  function dropHere() {
    if (!editor.scene || !drag || !drop) return;
    if (drag.kind === 'modifier') {
      const target = locateModifier(editor.scene, drop.id);
      if (target) {
        if (drop.where === 'inside') editor.moveTo(drag.id, target.inst.id, target.inst.children?.length ?? 0);
        else editor.moveTo(drag.id, target.parent?.id ?? null, target.index + (drop.where === 'after' ? 1 : 0));
      }
    } else {
      const target = locateNode(editor.scene.objects, drop.id);
      if (target) {
        if (drop.where === 'inside' && target.node.kind === 'group') editor.moveNode(drag.id, target.node.id, target.node.children.length);
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
    <div
      class="drag"
      draggable="true"
      data-drop={drop?.id === m.id ? drop.where : undefined}
      ondragstart={(e) => { e.stopPropagation(); drag = { id: m.id, kind: 'modifier' }; e.dataTransfer?.setData('text/plain', m.id); }}
      ondragover={(e) => overModifier(e, m)}
      ondrop={(e) => { e.stopPropagation(); dropHere(); }}
      ondragend={end}
      role="none"
    >
      <StackItem
        label={registry.get(m.type)?.label ?? m.type}
        kind={registry.get(m.type)?.kind}
        icon={m.type as IconName}
        {depth}
        selected={editor.selected === m.id}
        enabled={m.enabled !== false}
        onselect={() => (editor.selected = m.id)}
        ontoggle={(v) => editor.setEnabled(m.id, v)}
        onremove={() => editor.remove(m.id)}
      />
    </div>
    {#if m.children}
      {@render modifiers(m.children, depth + 1)}
      {#if m.children.length === 0}
        <p class="empty" style:--depth={depth + 1}>Drop or add a modifier here</p>
      {/if}
    {/if}
  {/each}
{/snippet}

{#snippet nodes(list: SceneNode[], depth: number)}
  {#each list as n (n.id)}
    {@const open = !editor.isCollapsed(n.id)}
    <div
      class="drag"
      class:hidden-node={n.visible === false}
      draggable="true"
      data-drop={drop?.id === n.id ? drop.where : undefined}
      ondragstart={(e) => { e.stopPropagation(); drag = { id: n.id, kind: 'node' }; e.dataTransfer?.setData('text/plain', n.id); }}
      ondragover={(e) => overNode(e, n)}
      ondrop={(e) => { e.stopPropagation(); dropHere(); }}
      ondragend={end}
      role="none"
    >
      <StackItem
        label={n.name}
        kind="object"
        icon={n.kind === 'group' ? 'group' : 'object'}
        {depth}
        expanded={n.stack.length || n.kind === 'group' ? open : undefined}
        selected={editor.selected === n.id}
        onselect={() => (editor.selected = n.id)}
        onexpand={(v) => editor.toggleCollapsed(n.id, v)}
        onremove={() => editor.remove(n.id)}
        visible={n.visible !== false}
        onvisible={(v) => editor.setNode(n.id, 'visible', v, true)}
        onungroup={n.kind === 'group' ? () => editor.ungroup(n.id) : undefined}
      />
    </div>
    {#if open}
      {@render modifiers(n.stack, depth + 1)}
      {#if n.kind === 'group'}{@render nodes(n.children, depth + 1)}{/if}
    {/if}
  {/each}
{/snippet}

<section class="stack" aria-label="Stack">
  <header>
    <h2>Stack</h2>
    {#if editor.scene}<span class="count" title="Objects">{editor.objectCount}</span>{/if}
    <IconButton icon="group" label="Group (⌘G)" disabled={!editor.activeNode} onclick={() => editor.group()} />
    <AddMenu {editor} />
  </header>
  {#if editor.scene}
    <div class="rows" role="tree" aria-label="Objects and modifiers">
      {@render nodes(editor.scene.objects, 0)}
    </div>
  {:else}
    <div class="hint">
      <p>No source yet.</p>
      <p class="dim">Import an SVG to start stacking modifiers.</p>
    </div>
  {/if}
</section>

<style>
  .stack { display: flex; flex-direction: column; min-height: 0; max-height: 50%; padding-bottom: var(--sv-space-8); border-bottom: var(--sv-border-1) solid var(--sv-rule-default); }
  header { display: flex; align-items: center; gap: var(--sv-space-4); height: 28px; padding: 0 var(--sv-space-4) 0 var(--sv-space-8); flex: none; }
  h2 { flex: 1; margin: 0; font-size: var(--sv-font-size-11); }
  .count { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); margin-right: var(--sv-space-4); }
  .rows { overflow-y: auto; }
  .drag { position: relative; }
  .hidden-node { opacity: 0.45; }
  .drag[data-drop='before']::after,
  .drag[data-drop='after']::after { content: ''; position: absolute; left: 0; right: 0; height: 2px; background: var(--sv-accent-fill); z-index: 1; }
  .drag[data-drop='before']::after { top: -1px; }
  .drag[data-drop='after']::after { bottom: -1px; }
  .drag[data-drop='inside'] { outline: 1px solid var(--sv-accent-fill); outline-offset: -1px; }
  .empty {
    margin: 0;
    height: 22px;
    display: flex;
    align-items: center;
    padding-left: calc(var(--sv-space-4) + var(--depth) * var(--sv-space-12) + 16px);
    color: var(--sv-text-disabled);
    font-size: var(--sv-font-size-10);
  }
  .hint { margin: 0; padding: var(--sv-space-4) var(--sv-space-8); color: var(--sv-text-muted); }
  .hint p { margin: 0 0 var(--sv-space-4); }
  .dim { color: var(--sv-text-disabled); font-size: var(--sv-font-size-10); }
</style>
