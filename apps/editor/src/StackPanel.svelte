<script lang="ts">
  import type { ModifierInstance } from '@svertik/engine';
  import { StackItem, type IconName } from '@svertik/ui';
  import AddMenu from './AddMenu.svelte';
  import { containers, locate, registry, type Editor } from './editor.svelte';

  let { editor }: { editor: Editor } = $props();

  // Arrastrar: antes o después de una fila, o dentro (tercio central de una fila de Step).
  type Drop = { id: string; where: 'before' | 'after' | 'inside' };
  let dragId = $state<string | null>(null);
  let drop = $state<Drop | null>(null);

  function over(e: DragEvent, m: ModifierInstance) {
    if (!dragId || dragId === m.id) return;
    e.preventDefault();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    const dragged = editor.scene && locate(editor.scene.stack, dragId)?.inst;
    const canNest = containers.has(m.type) && dragged && !containers.has(dragged.type);
    drop = { id: m.id, where: canNest && y > 0.25 && y < 0.75 ? 'inside' : y < 0.5 ? 'before' : 'after' };
  }

  function dropHere() {
    if (!editor.scene || !dragId || !drop) return;
    const target = locate(editor.scene.stack, drop.id);
    if (target) {
      if (drop.where === 'inside') editor.moveTo(dragId, target.inst.id, target.inst.children?.length ?? 0);
      else editor.moveTo(dragId, target.parent?.id ?? null, target.index + (drop.where === 'after' ? 1 : 0));
    }
    dragId = null;
    drop = null;
  }
</script>

{#snippet rows(list: ModifierInstance[], depth: number)}
  {#each list as m (m.id)}
    <div
      class="drag"
      draggable="true"
      data-drop={drop?.id === m.id ? drop.where : undefined}
      ondragstart={(e) => { e.stopPropagation(); dragId = m.id; e.dataTransfer?.setData('text/plain', m.id); }}
      ondragover={(e) => over(e, m)}
      ondrop={(e) => { e.stopPropagation(); dropHere(); }}
      ondragend={() => { dragId = null; drop = null; }}
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
      {@render rows(m.children, depth + 1)}
      {#if m.children.length === 0}
        <p class="empty" style:--depth={depth + 1}>Drop or add a modifier here</p>
      {/if}
    {/if}
  {/each}
{/snippet}

<section class="stack" aria-label="Stack">
  <header>
    <h2>Stack</h2>
    {#if editor.scene}<span class="count">{editor.scene.stack.length}</span>{/if}
    <AddMenu {editor} />
  </header>
  {#if editor.scene}
    <div class="rows" role="tree" aria-label="Modifier stack">
      <StackItem
        label={editor.name}
        kind="object"
        icon="object"
        expanded={editor.expanded}
        selected={editor.selected === null}
        onselect={() => (editor.selected = null)}
        onexpand={(v) => (editor.expanded = v)}
      />
      {#if editor.expanded}{@render rows(editor.scene.stack, 1)}{/if}
    </div>
    {#if editor.scene.stack.length === 0}
      <p class="hint">Add a modifier with + or from the toolbar.</p>
    {/if}
  {:else}
    <div class="hint">
      <p>No source yet.</p>
      <p class="dim">Import an SVG to start stacking modifiers.</p>
    </div>
  {/if}
</section>

<style>
  .stack { display: flex; flex-direction: column; min-height: 0; max-height: 50%; padding-bottom: var(--sv-space-8); border-bottom: var(--sv-border-1) solid var(--sv-rule-default); }
  header { display: flex; align-items: center; gap: var(--sv-space-8); height: 28px; padding: 0 var(--sv-space-4) 0 var(--sv-space-8); flex: none; }
  h2 { flex: 1; margin: 0; font-size: var(--sv-font-size-11); }
  .count { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .rows { overflow-y: auto; }
  .drag { position: relative; }
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
