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
  <span class="sep" aria-hidden="true"></span>
  {#each shapes as s (s.type)}
    <!-- Doble clic: la primitiva aparece en el centro del lienzo, lista para editar. -->
    <span class="tool" role="none" ondblclick={() => { editor.tool = null; if (editor.scene && Date.now() - created > 600) oncenter?.(s.type); }}>
      <IconButton icon={s.type as IconName} label={`${s.label} — drag on the canvas, or double-click to add it in the center (Esc cancels)`} active={editor.tool === s.type} onclick={() => choose(s.type)} />
    </span>
  {/each}
</div>

<style>
  .tool { display: flex; }
  .sep { height: 1px; margin: var(--sv-space-2) var(--sv-space-2); background: var(--sv-rule-default); }
  .tools {
    position: absolute;
    top: var(--sv-space-12);
    left: var(--sv-space-12);
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: var(--sv-space-2);
    padding: var(--sv-space-4);
    background: var(--sv-surface-panel);
    border: var(--sv-border-1) solid var(--sv-rule-default);
  }
</style>
