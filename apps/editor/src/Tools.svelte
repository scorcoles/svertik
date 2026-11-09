<script lang="ts">
  import { shapes } from '@svertik/engine';
  import { IconButton, type IconName } from '@svertik/ui';
  import type { Editor } from './editor.svelte';

  let { editor }: { editor: Editor } = $props();

  function choose(type: string) {
    // Sin escena no hay dónde arrastrar: se crea al centro, a su tamaño por defecto.
    if (!editor.scene) return editor.addShape(type);
    editor.tool = editor.tool === type ? null : type;
  }
</script>

<div class="tools" role="toolbar" aria-label="Primitives" aria-orientation="vertical">
  {#each shapes as s (s.type)}
    <IconButton icon={s.type as IconName} label={`${s.label} — drag on the canvas (Esc cancels)`} active={editor.tool === s.type} onclick={() => choose(s.type)} />
  {/each}
</div>

<style>
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
