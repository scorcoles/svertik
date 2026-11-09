<script lang="ts">
  import { bounds, builtins, createEngine, renderInto, type Bounds, type Scene } from '@svertik/engine';
  import { Button, Checkbox, Icon } from '@svertik/ui';
  import type { Editor } from './editor.svelte';
  import { samples, type SampleName } from './samples';

  interface Props {
    editor: Editor;
    onimport: () => void;
    onfile: (file: File) => void;
  }
  let { editor, onimport, onfile }: Props = $props();

  const engine = createEngine(builtins);
  let result = $state<SVGSVGElement>();
  let ghost = $state<SVGSVGElement>();
  let renderError = $state<string | null>(null);
  let dragging = $state(false);
  let size = $state<[number, number]>([0, 0]);
  let stage = $state<HTMLDivElement>();
  let sourceBounds: Bounds | null = null;
  let markerAt = $state<{ x: number; y: number } | null>(null);

  $effect(() => {
    if (!editor.scene || !result) return;
    const scene = $state.snapshot(editor.scene) as Scene;
    // Mientras el script anima, se pinta su pila (sin tocar la escena guardada).
    if (editor.preview) scene.stack = $state.snapshot(editor.preview) as Scene['stack'];
    try {
      const steps = engine.evaluateSteps(scene);
      renderInto(result, steps.at(-1)!);
      if (ghost) renderInto(ghost, steps[0]!);
      size = [steps[0]!.viewBox[2], steps[0]!.viewBox[3]];
      sourceBounds = bounds(steps[0]!);
      renderError = null;
    } catch (e) {
      renderError = e instanceof Error ? e.message : String(e);
    }
  });

  // Fracción de la caja de origen → píxeles del escenario, con la misma transformación que el SVG pintado.
  $effect(() => {
    const m = editor.marker;
    if (!m || !result || !stage || !sourceBounds) {
      markerAt = null;
      return;
    }
    const ctm = result.getScreenCTM();
    if (!ctm) return;
    const b = sourceBounds;
    const p = new DOMPoint(b.x + m[0] * b.width, b.y + m[1] * b.height).matrixTransform(ctm);
    const r = stage.getBoundingClientRect();
    markerAt = { x: p.x - r.left, y: p.y - r.top };
  });

  function drop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    const file = e.dataTransfer?.files[0];
    if (file) onfile(file);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section
  class="canvas"
  aria-label="Canvas"
  data-dragging={dragging || undefined}
  ondragover={(e) => { e.preventDefault(); dragging = true; }}
  ondragleave={() => (dragging = false)}
  ondrop={drop}
>
  {#if editor.scene}
    <div class="stage" bind:this={stage}>
      {#if editor.showOriginal}<svg class="ghost" bind:this={ghost} aria-hidden="true"></svg>{/if}
      <svg class="result" class:wire={editor.showWire} bind:this={result} role="img" aria-label="Result"></svg>
      {#if markerAt}<span class="marker" style:left="{markerAt.x}px" style:top="{markerAt.y}px" aria-hidden="true"></span>{/if}
    </div>
    {#if renderError}<p class="error" role="alert">{renderError}</p>{/if}
    <footer>
      <span>Fit</span>
      <span class="muted">{size[0]} × {size[1]}</span>
      <label><Checkbox bind:checked={editor.showOriginal} label="Show original" /> Original</label>
      <label><Checkbox bind:checked={editor.showWire} label="Wire view" /> Wire</label>
    </footer>
  {:else}
    <div class="drop">
      <Icon name="import" />
      <strong>Drop an SVG here</strong>
      <span class="muted">or paste it (⌘V)</span>
      <Button label="Choose file…" onclick={onimport} />
      <span class="samples muted">
        or start from a sample:
        {#each Object.keys(samples) as name, i (name)}
          {#if i > 0}<span aria-hidden="true">·</span>{/if}
          <button type="button" onclick={() => editor.load(samples[name as SampleName], `${name}.svg`)}>{name}</button>
        {/each}
      </span>
      {#if editor.error}<p class="error" role="alert">{editor.error}</p>{/if}
    </div>
  {/if}
</section>

<style>
  .canvas {
    position: relative;
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--sv-surface-field);
  }
  .canvas[data-dragging] { outline: 1px dashed var(--sv-accent-fill); outline-offset: -8px; }
  .stage { position: absolute; inset: 48px 48px 56px; }
  .stage svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .ghost { opacity: 0.2; }
  /* Cruz del punto que se está moviendo: tamaño fijo en pantalla, por encima del dibujo. */
  .marker {
    position: absolute;
    width: 15px;
    height: 15px;
    translate: -50% -50%;
    pointer-events: none;
    background:
      linear-gradient(var(--sv-signal-error), var(--sv-signal-error)) center / 1px 100% no-repeat,
      linear-gradient(var(--sv-signal-error), var(--sv-signal-error)) center / 100% 1px no-repeat;
  }
  .wire :global(path) {
    fill: none !important;
    stroke: var(--sv-text-secondary) !important;
    stroke-width: 1px !important;
    vector-effect: non-scaling-stroke;
  }
  footer {
    position: absolute;
    left: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    gap: var(--sv-space-16);
    height: 28px;
    padding: 0 var(--sv-space-12);
    font-size: var(--sv-font-size-10);
    color: var(--sv-text-secondary);
  }
  footer label { display: flex; align-items: center; gap: var(--sv-space-6); color: var(--sv-text-muted); cursor: pointer; }
  .muted { color: var(--sv-text-muted); }
  .drop {
    display: grid;
    justify-items: center;
    gap: var(--sv-space-12);
    width: min(480px, 100% - 32px);
    padding: 64px var(--sv-space-16);
    border: 1px dashed var(--sv-rule-strong);
    color: var(--sv-text-muted);
    text-align: center;
  }
  .drop strong { color: var(--sv-text-primary); font-size: var(--sv-font-size-12); }
  .samples { font-size: var(--sv-font-size-10); display: flex; gap: var(--sv-space-6); flex-wrap: wrap; justify-content: center; }
  .samples button { padding: 0; font: inherit; color: var(--sv-text-secondary); background: none; border: 0; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
  .samples button:hover { color: var(--sv-accent-fill); }
  .error { margin: 0; color: var(--sv-signal-error); font-size: var(--sv-font-size-10); }
  .canvas > .error { position: absolute; top: var(--sv-space-12); left: var(--sv-space-12); }
</style>
