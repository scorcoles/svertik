<script lang="ts">
  import { shapes } from '@svertik/engine';
  import { IconButton, type IconName } from '@svertik/ui';
  import type { Editor } from './editor.svelte';

  let { editor, oncenter }: { editor: Editor; oncenter?: (type: string) => void } = $props();

  // If the first click already created the primitive (no scene), the double-click does not create another.
  let created = 0;
  function choose(type: string) {
    // No scene means nowhere to drag: it is created at the centre, at its default size.
    if (!editor.scene) {
      created = Date.now();
      return editor.addShape(type);
    }
    editor.tool = editor.tool === type ? null : type;
  }
</script>

<div class="tools" role="toolbar" aria-label="Primitives" aria-orientation="vertical">
  <!-- Selecting or moving uses the pointer tool. Drawing tools stay active for repeated primitives. -->
  <IconButton icon="select" label="Select (V or Esc)" active={!editor.tool && !editor.editingPath} onclick={() => { editor.tool = null; editor.editingPath = null; }} />
  <IconButton icon="edit-points" label="Edit points (N) — select a Path to edit its anchors and handles" active={editor.tool === 'nodes' || !!editor.editingPath} onclick={() => editor.startPointEditing()} />
  <span class="sep" aria-hidden="true"></span>
  <IconButton icon="pencil" label="Path — click for corners, drag for curves; Enter finishes, click the first point to close" active={editor.tool === 'pen'} onclick={() => { editor.editingPath = null; if (!editor.scene) { editor.addShape('path', { fill: false, stroke: true, strokeWidth: 2 }); editor.editingPath = editor.selected; } else editor.tool = editor.tool === 'pen' ? null : 'pen'; }} />
  {#each shapes.filter(s => s.type !== 'path') as s (s.type)}
    <!-- Double-click: the primitive appears at the centre of the canvas, ready to edit. -->
    <span class="tool" role="none" ondblclick={() => { editor.tool = null; if (editor.scene && Date.now() - created > 600) oncenter?.(s.type); }}>
      <IconButton icon={s.type as IconName} label={`${s.label} — drag on the canvas, or double-click to add it in the center (stays active; Esc cancels)`} active={editor.tool === s.type} onclick={() => choose(s.type)} />
    </span>
  {/each}
</div>

<style>
  /* On the vertical rail: no box of its own (the rail provides the surface) and the same size as the menus. */
  .tools { display: flex; flex-direction: column; align-items: center; gap: var(--sv-space-2); }
  .tool { display: flex; }
  .tools :global(.sv-icon-button) { width: 32px; height: 32px; }
  .sep { width: 20px; height: 1px; margin: var(--sv-space-2) 0; background: var(--sv-rule-default); }
</style>
