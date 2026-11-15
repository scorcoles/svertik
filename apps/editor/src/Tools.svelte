<script lang="ts">
  import { shapes } from '@svertik/engine';
  import { IconButton, type IconName } from '@svertik/ui';
  import type { Editor } from './editor.svelte';

  let { editor, oncenter }: { editor: Editor; oncenter?: (type: string) => void } = $props();

  // Si el primer clic ya creó la primitiva (sin escena), el doble clic no crea otra.
  let created = 0;
  function choose(type: string) {
    // Sin escena no hay dónde arrastrar: se crea al centro, a su tamaño por defecto.
    if (!editor.scene) {
      created = Date.now();
      return editor.addShape(type);
    }
    editor.tool = editor.tool === type ? null : type;
  }
</script>

<div class="tools" role="toolbar" aria-label="Primitives" aria-orientation="vertical">
  <!-- Seleccionar (y mover): sin herramienta de dibujo armada. Tras crear una primitiva se vuelve aquí. -->
  <IconButton icon="select" label="Select (V or Esc)" active={!editor.tool} onclick={() => (editor.tool = null)} />
  <IconButton icon="pencil" label="Pen — click to add points, drag to set Bézier handles, Enter to finish" active={editor.tool === 'pen'} onclick={() => (editor.tool = editor.tool === 'pen' ? null : 'pen')} />
  <span class="sep" aria-hidden="true"></span>
  {#each shapes as s (s.type)}
    <!-- Doble clic: la primitiva aparece en el centro del lienzo, lista para editar. -->
    <span class="tool" role="none" ondblclick={() => { editor.tool = null; if (editor.scene && Date.now() - created > 600) oncenter?.(s.type); }}>
      <IconButton icon={s.type as IconName} label={`${s.label} — drag on the canvas, or double-click to add it in the center (Esc cancels)`} active={editor.tool === s.type} onclick={() => choose(s.type)} />
    </span>
  {/each}
</div>

<style>
  /* En el rail vertical: sin caja propia (la superficie la pone el rail) y del mismo tamaño que los menús. */
  .tools { display: flex; flex-direction: column; align-items: center; gap: var(--sv-space-2); }
  .tool { display: flex; }
  .tools :global(.sv-icon-button) { width: 32px; height: 32px; }
  .sep { width: 20px; height: 1px; margin: var(--sv-space-2) 0; background: var(--sv-rule-default); }
</style>
