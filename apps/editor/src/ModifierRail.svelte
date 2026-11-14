<script lang="ts">
  import { ColorField } from '@svertik/ui';
  import type { Editor } from './editor.svelte';
  import Tools from './Tools.svelte';

  let { editor, placeAtCenter }: { editor: Editor; placeAtCenter?: (type: string) => void } = $props();
</script>

<nav class="rail" aria-label="Tools, modifiers and colors">
  <Tools {editor} oncenter={placeAtCenter} />
  <!-- Colores: relleno y contorno, de la selección o de las primitivas nuevas. -->
  <div class="colors" role="group" aria-label="Colors">
    <span class="color-row" title="Fill color: selection, or new objects">
      <span class="color-label">Fill</span>
      <ColorField compact label="Fill color" value={editor.currentFill} swatches={editor.docColors} onchange={(v) => editor.setFillColor(v)} />
    </span>
    <span class="color-row" title="Outline color: selection, or new objects">
      <span class="color-label">Stroke</span>
      <ColorField compact label="Outline color" value={editor.currentOutline} swatches={editor.docColors} onchange={(v) => editor.setOutlineColor(v)} />
    </span>
  </div>
</nav>

<style>
  .rail {
    /* Es una columna del grid de App (main): se coloca sola ahí. */
    grid-area: rail;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sv-space-6);
    padding: var(--sv-space-8) var(--sv-space-4);
    background: var(--sv-surface-app);
    border-right: var(--sv-border-1) solid var(--sv-rule-default);
    min-height: 0;
    overflow-y: auto;
  }
  /* Al fondo del rail: relleno y contorno. */
  .colors {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sv-space-6);
    width: 32px;
    margin-top: auto;
    padding-top: var(--sv-space-6);
    border-top: var(--sv-border-1) solid var(--sv-rule-default);
  }
  /* Selectores algo más pequeños que los botones, con su nombre encima. */
  .color-row { display: flex; flex-direction: column; align-items: center; gap: 2px; width: 32px; }
  .colors :global(.sv-color[data-compact]) { width: 28px; height: 28px; padding: 3px; }
  .colors :global(.sv-color-swatch) { width: 20px; height: 20px; }
  .color-label { font-size: 8px; line-height: 1; color: var(--sv-text-muted); }
</style>
