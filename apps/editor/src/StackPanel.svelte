<script lang="ts">
  import { StackItem, type IconName } from '@svertik/ui';
  import AddMenu from './AddMenu.svelte';
  import { registry, type Editor } from './editor.svelte';

  let { editor }: { editor: Editor } = $props();

  // Reordenar arrastrando: se suelta antes o después de la fila de destino.
  let dragId = $state<string | null>(null);
  let dropAt = $state<{ id: string; after: boolean } | null>(null);

  function over(e: DragEvent, id: string) {
    if (!dragId) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dropAt = { id, after: e.clientY > r.top + r.height / 2 };
  }
  function drop() {
    const stack = editor.scene?.stack;
    if (!stack || !dragId || !dropAt) return;
    const from = stack.findIndex((m) => m.id === dragId);
    let to = stack.findIndex((m) => m.id === dropAt!.id) + (dropAt.after ? 1 : 0);
    if (from < to) to -= 1;
    editor.move(dragId, to);
    dragId = null;
    dropAt = null;
  }
</script>

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
      {#if editor.expanded}
        {#each editor.scene.stack as m (m.id)}
          <div
            class="drag"
            draggable="true"
            data-drop={dropAt?.id === m.id ? (dropAt.after ? 'after' : 'before') : undefined}
            ondragstart={(e) => { dragId = m.id; e.dataTransfer?.setData('text/plain', m.id); }}
            ondragover={(e) => over(e, m.id)}
            ondrop={drop}
            ondragend={() => { dragId = null; dropAt = null; }}
            role="none"
          >
            <StackItem
              label={registry.get(m.type)?.label ?? m.type}
              kind={registry.get(m.type)?.kind}
              icon={m.type as IconName}
              selected={editor.selected === m.id}
              enabled={m.enabled !== false}
              onselect={() => (editor.selected = m.id)}
              ontoggle={(v) => editor.setEnabled(m.id, v)}
              onremove={() => editor.remove(m.id)}
            />
          </div>
        {/each}
      {/if}
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
  .stack { display: flex; flex-direction: column; min-height: 0; padding-bottom: var(--sv-space-8); border-bottom: var(--sv-border-1) solid var(--sv-rule-default); }
  header { display: flex; align-items: center; gap: var(--sv-space-8); height: 28px; padding: 0 var(--sv-space-4) 0 var(--sv-space-8); flex: none; }
  h2 { flex: 1; margin: 0; font-size: var(--sv-font-size-11); }
  .count { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .rows { overflow-y: auto; }
  .drag { position: relative; }
  .drag[data-drop]::after { content: ''; position: absolute; left: 0; right: 0; height: 2px; background: var(--sv-accent-fill); z-index: 1; }
  .drag[data-drop='before']::after { top: -1px; }
  .drag[data-drop='after']::after { bottom: -1px; }
  .hint { margin: 0; padding: var(--sv-space-4) var(--sv-space-8); color: var(--sv-text-muted); }
  .hint p { margin: 0 0 var(--sv-space-4); }
  .dim { color: var(--sv-text-disabled); font-size: var(--sv-font-size-10); }
</style>
