<script lang="ts">
  import { t } from '@svertik/ui';
  import { ColorField } from '@svertik/ui';
  import type { Editor } from './editor.svelte';
  import Tools from './Tools.svelte';

  let { editor, placeAtCenter }: { editor: Editor; placeAtCenter?: (type: string) => void } = $props();
  const canPick = typeof window !== 'undefined' && 'EyeDropper' in window;
  async function pickColor() {
    if (!canPick) return;
    try {
      const EyeDropperApi = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
      editor.setFillColor((await new EyeDropperApi().open()).sRGBHex);
    } catch {
      // Escape cancels the native eyedropper without changing the selected color.
    }
  }
</script>

<nav class="rail" aria-label={t('Tools, modifiers and colors')}>
  <Tools {editor} oncenter={placeAtCenter} />
  <!-- Colours: fill and stroke, of the selection or of new primitives. -->
  <div class="colors" role="group" aria-label={t('Colors')}>
    <button class="color-tool" type="button" disabled={!canPick} aria-label={t('Pick fill color from screen')} title={canPick ? (editor.selectedNodes.length ? t('Eyedropper: apply the picked color to the selected object') : t('Eyedropper: pick a color for Fill')) : t('Screen color picker is not supported in this browser')} onclick={pickColor}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10.9 1.8 3.3 3.3-2.1 2.1-3.3-3.3 2.1-2.1ZM9.5 3.2l3.3 3.3M10.7 7 5 12.7H3.3v-1.7L9 5.3M2.3 13.7l-1 1 2.4-.4 1-1" /></svg>
    </button>
    <span class="color-row" title={t('Fill color: selection, or new objects')}>
      <span class="color-label">{t('Fill')}</span>
      <ColorField compact label={t('Fill color')} value={editor.currentFill} swatches={editor.docColors} onchange={(v) => editor.setFillColor(v)} />
    </span>
    <span class="color-row" title={t('Outline color: selection, or new objects')}>
      <span class="color-label">{t('Stroke')}</span>
      <ColorField compact label={t('Outline color')} value={editor.currentOutline} swatches={editor.docColors} onchange={(v) => editor.setOutlineColor(v)} />
    </span>
  </div>
</nav>

<style>
  .rail {
    /* It is a column of App's grid (main): it places itself there. */
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
  /* At the bottom of the rail: fill and stroke. */
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
  .color-tool { display: grid; place-items: center; width: 28px; height: 24px; padding: 3px; color: var(--sv-text-secondary); background: none; border: 0; cursor: crosshair; }
  .color-tool:hover:not(:disabled) { color: var(--sv-accent-text); background: var(--sv-surface-hover); }
  .color-tool:disabled { display: none; }
  .color-tool svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.2; stroke-linecap: round; stroke-linejoin: round; }
  /* Pickers a bit smaller than the buttons, with their name above. */
  .color-row { display: flex; flex-direction: column; align-items: center; gap: 2px; width: 32px; }
  .colors :global(.sv-color[data-compact]) { width: 28px; height: 28px; padding: 3px; }
  .colors :global(.sv-color-swatch) { width: 20px; height: 20px; }
  .color-label { font-size: var(--sv-font-size-10); line-height: 1; color: var(--sv-text-muted); }
</style>
