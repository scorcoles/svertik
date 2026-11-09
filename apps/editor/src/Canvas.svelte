<script lang="ts">
  import { bounds, builtins, createEngine, renderInto, type Bounds, type Scene } from '@svertik/engine';
  import { Button, Icon } from '@svertik/ui';
  import { registry, type Editor } from './editor.svelte';
  import { samples, type SampleName } from './samples';
  import { actualSize, FIT, fitScale, wheelFactor, wheelIntent, zoomAt, type View } from './viewport';

  interface Props {
    editor: Editor;
    onimport: () => void;
    onfile: (file: File) => void;
  }
  let { editor, onimport, onfile }: Props = $props();

  const engine = createEngine(builtins);
  let result = $state<SVGSVGElement>();
  let ghost = $state<SVGSVGElement>();
  let stage = $state<HTMLDivElement>();
  let renderError = $state<string | null>(null);
  let dropping = $state(false);
  let size = $state<[number, number]>([0, 0]);
  let viewBox = $state<[number, number, number, number]>([0, 0, 1, 1]);
  let sourceBounds = $state<Bounds | null>(null);

  // ── Pintar

  $effect(() => {
    if (!editor.scene || !result) return;
    const scene = $state.snapshot(editor.scene) as Scene;
    // Mientras el script anima, se pinta su pila (sin tocar la escena guardada).
    if (editor.preview) scene.stack = $state.snapshot(editor.preview) as Scene['stack'];
    try {
      const steps = engine.evaluateSteps(scene);
      const last = steps.at(-1)!;
      renderInto(result, last);
      if (ghost) {
        renderInto(ghost, steps[0]!);
        ghost.setAttribute('viewBox', last.viewBox.join(' '));
      }
      size = [steps[0]!.viewBox[2], steps[0]!.viewBox[3]];
      viewBox = last.viewBox;
      sourceBounds = bounds(steps[0]!);
      renderError = null;
    } catch (e) {
      renderError = e instanceof Error ? e.message : String(e);
    }
  });

  // ── Vista: zoom y desplazamiento

  let view = $state<View>(FIT);
  let stageSize = $state<[number, number]>([1, 1]);
  $effect(() => {
    if (!stage) return;
    const ro = new ResizeObserver(([e]) => (stageSize = [e!.contentRect.width, e!.contentRect.height]));
    ro.observe(stage);
    return () => ro.disconnect();
  });
  // Margen alrededor del dibujo (igual que en el CSS de .view): el encaje se mide dentro.
  const INSET = { left: 48, top: 48, right: 48, bottom: 56 };
  const box = $derived([stageSize[0] - INSET.left - INSET.right, stageSize[1] - INSET.top - INSET.bottom] as const);
  const fit = $derived(fitScale(box[0], box[1], viewBox[2], viewBox[3]));
  const percent = $derived(Math.round(fit * view.zoom * 100));

  // Al cambiar de dibujo, se vuelve a encajar.
  let lastSource = '';
  $effect(() => {
    const src = editor.scene?.source ?? '';
    if (src !== lastSource) {
      lastSource = src;
      view = FIT;
    }
  });

  /** Coordenadas del puntero respecto al origen de la capa que se escala. */
  const local = (e: { clientX: number; clientY: number }) => {
    const r = stage!.getBoundingClientRect();
    return [e.clientX - r.left - INSET.left, e.clientY - r.top - INSET.top] as const;
  };

  function wheel(e: WheelEvent) {
    if (!stage || !editor.scene) return;
    e.preventDefault();
    if (wheelIntent(e) === 'zoom') {
      const [x, y] = local(e);
      view = zoomAt(view, wheelFactor(e.deltaY, e.ctrlKey || e.metaKey), x, y);
    } else {
      view = { zoom: view.zoom, pan: { x: view.pan.x - e.deltaX, y: view.pan.y - e.deltaY } };
    }
  }
  // La rueda necesita un listener no pasivo para poder cancelar el scroll de la página.
  $effect(() => {
    if (!stage) return;
    stage.addEventListener('wheel', wheel, { passive: false });
    return () => stage?.removeEventListener('wheel', wheel);
  });

  // Espacio + arrastrar, o botón central: mover el lienzo.
  let space = $state(false);
  let panning = $state(false);
  const typing = (e: Event) => {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  };
  function keydown(e: KeyboardEvent) {
    if (typing(e) || !editor.scene) return;
    if (e.code === 'Space' && !e.repeat) { space = true; e.preventDefault(); }
    else if (e.shiftKey && e.code === 'Digit1') { e.preventDefault(); view = FIT; }
    else if (e.shiftKey && e.code === 'Digit0') { e.preventDefault(); view = actualSize(view, fit, box[0], box[1]); }
  }
  function keyup(e: KeyboardEvent) {
    if (e.code === 'Space') space = false;
  }
  function pointerdown(e: PointerEvent) {
    if (!(space || e.button === 1)) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    panning = true;
    const x0 = e.clientX, y0 = e.clientY, p0 = view.pan;
    const move = (ev: PointerEvent) => (view = { zoom: view.zoom, pan: { x: p0.x + ev.clientX - x0, y: p0.y + ev.clientY - y0 } });
    const up = () => { panning = false; el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }

  // ── Tiradores: los puntos del efecto seleccionado se arrastran sobre el dibujo

  interface Handle { name: string; label: string; x: number; y: number }
  let hover = $state<string | null>(null);
  let grabbing = $state<string | null>(null);

  const handleParams = $derived.by(() => {
    const m = editor.current;
    // Dentro de Step cada copia tiene su propio centro: no hay un único sitio que arrastrar.
    if (!m || editor.currentParent) return [];
    const def = registry.get(m.type);
    return Object.entries(def?.params ?? {})
      .filter(([, s]) => s.type === 'point' && s.handle !== false)
      .map(([name, s]) => ({ name, label: s.label ?? name }));
  });

  const toScreen = (fx: number, fy: number): [number, number] | null => {
    const ctm = result?.getScreenCTM();
    const b = sourceBounds;
    if (!ctm || !b || !stage) return null;
    const p = new DOMPoint(b.x + fx * b.width, b.y + fy * b.height).matrixTransform(ctm);
    const r = stage.getBoundingClientRect();
    return [p.x - r.left, p.y - r.top];
  };
  const toFraction = (clientX: number, clientY: number): [number, number] | null => {
    const ctm = result?.getScreenCTM();
    const b = sourceBounds;
    if (!ctm || !b || b.width === 0 || b.height === 0) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    const r = (n: number) => Math.round(n * 1000) / 1000;
    return [r((p.x - b.x) / b.width), r((p.y - b.y) / b.height)];
  };

  // Se calculan después de pintar (con el zoom ya aplicado en el DOM), no antes.
  let handles = $state<Handle[]>([]);
  $effect(() => {
    void view; void stageSize; void viewBox; void sourceBounds;
    const m = editor.current;
    const values = handleParams.map(({ name }) => $state.snapshot(m?.params?.[name]) as [number, number] | undefined);
    const frame = requestAnimationFrame(() => {
      handles = handleParams.flatMap(({ name, label }, i) => {
        const v = values[i];
        const at = v && toScreen(v[0], v[1]);
        return at ? [{ name, label, x: at[0], y: at[1] }] : [];
      });
    });
    return () => cancelAnimationFrame(frame);
  });

  function grab(e: PointerEvent, h: Handle) {
    if (space) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    grabbing = h.name;
    const move = (ev: PointerEvent) => {
      const f = toFraction(ev.clientX, ev.clientY);
      if (f) editor.setParam(h.name, f);
    };
    const up = () => { grabbing = null; el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }
  function nudgeHandle(e: KeyboardEvent, h: Handle) {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    const v = editor.current?.params?.[h.name] as [number, number] | undefined;
    if (!d || !v) return;
    e.preventDefault();
    e.stopPropagation();
    const k = e.shiftKey ? 0.1 : 0.01;
    const r = (n: number) => Math.round(n * 1000) / 1000;
    editor.setParam(h.name, [r(v[0] + d[0]! * k), r(v[1] + d[1]! * k)]);
  }

  function drop(e: DragEvent) {
    e.preventDefault();
    dropping = false;
    const file = e.dataTransfer?.files[0];
    if (file) onfile(file);
  }
</script>

<svelte:window onkeydown={keydown} onkeyup={keyup} onblur={() => (space = false)} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section
  class="canvas"
  aria-label="Canvas"
  data-dragging={dropping || undefined}
  ondragover={(e) => { e.preventDefault(); dropping = true; }}
  ondragleave={() => (dropping = false)}
  ondrop={drop}
>
  {#if editor.scene}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="stage" bind:this={stage} data-space={space || undefined} data-panning={panning || undefined} onpointerdown={pointerdown}>
      <div class="view" style:transform="translate({view.pan.x}px, {view.pan.y}px) scale({view.zoom})">
        {#if editor.showOriginal}<svg class="ghost" bind:this={ghost} aria-hidden="true"></svg>{/if}
        <svg class="result" class:wire={editor.showWire} bind:this={result} role="img" aria-label="Result"></svg>
      </div>
      {#each handles as h (h.name)}
        <button
          type="button"
          class="handle"
          style:left="{h.x}px"
          style:top="{h.y}px"
          data-active={editor.marker || hover === h.name || grabbing === h.name ? '' : undefined}
          aria-label={`Move ${h.label} (arrow keys nudge)`}
          title={h.label}
          onpointerdown={(e) => grab(e, h)}
          onpointerenter={() => (hover = h.name)}
          onpointerleave={() => (hover = null)}
          onkeydown={(e) => nudgeHandle(e, h)}
        ></button>
      {/each}
    </div>
    {#if renderError}<p class="error" role="alert">{renderError}</p>{/if}
    <footer>
      <span class="pct" title="Zoom (wheel or pinch)">{percent}%</span>
      <span class="zoom">
        <button type="button" onclick={() => (view = FIT)} title="Fit (⇧1)">Fit</button>
        <button type="button" onclick={() => (view = actualSize(view, fit, box[0], box[1]))} title="100% (⇧0)">100%</button>
      </span>
      <span class="muted">{size[0]} × {size[1]}</span>
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
  .stage { position: absolute; inset: 0; overflow: hidden; }
  .stage[data-space] { cursor: grab; }
  .stage[data-panning] { cursor: grabbing; }
  .view { position: absolute; inset: 48px 48px 56px; transform-origin: 0 0; }
  .view svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  /* Tirador: cuadradito en reposo; con la cruz al pasar, al arrastrar o al cambiar el punto desde el campo. */
  .handle {
    position: absolute;
    width: 7px;
    height: 7px;
    padding: 0;
    translate: -50% -50%;
    background: var(--sv-surface-field);
    border: 1px solid var(--sv-signal-error);
    border-radius: 0;
    cursor: move;
  }
  .handle::before,
  .handle::after { content: ''; position: absolute; display: none; background: var(--sv-signal-error); pointer-events: none; }
  .handle::before { left: 50%; top: -5px; width: 1px; height: 15px; translate: -50% 0; }
  .handle::after { top: 50%; left: -5px; height: 1px; width: 15px; translate: 0 -50%; }
  .handle[data-active]::before,
  .handle[data-active]::after { display: block; }
  .handle:focus-visible { outline: 1px solid var(--sv-accent-fill); outline-offset: 2px; }
  .stage[data-space] .handle { pointer-events: none; }
  .ghost { opacity: 0.2; }
  .wire :global(path) {
    fill: none !important;
    stroke: var(--sv-text-secondary) !important;
    stroke-width: 1px !important;
    vector-effect: non-scaling-stroke;
  }
  .pct { min-width: 4ch; }
  .zoom { display: flex; gap: var(--sv-space-4); }
  .zoom button {
    height: 18px;
    padding: 0 var(--sv-space-6);
    font: inherit;
    color: var(--sv-text-secondary);
    background: none;
    border: 1px solid var(--sv-rule-strong);
    cursor: pointer;
  }
  .zoom button:hover { color: var(--sv-text-primary); border-color: var(--sv-text-muted); }
  footer {
    position: absolute;
    left: 0;
    bottom: 0;
    z-index: 1;
    background: var(--sv-surface-field);
    display: flex;
    align-items: center;
    gap: var(--sv-space-16);
    height: 28px;
    padding: 0 var(--sv-space-12);
    font-size: var(--sv-font-size-10);
    color: var(--sv-text-secondary);
  }
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
