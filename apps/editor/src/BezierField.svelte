<script lang="ts">
  // A segment's curve drawn by hand: time across, value up, and the two handles of a cubic Bézier to drag
  // (as CSS's cubic-bezier). The handles' time stays within the segment; their value may overshoot.
  import { t } from '@svertik/ui';
  import { bezierEase, ease, type Bezier } from '@svertik/engine';

  let { value, custom = false, onchange }: {
    value: Bezier;
    /** Whether the segment already has a custom curve (otherwise the handles show the named one's closest). */
    custom?: boolean;
    /** `final`: the drag ended (one undo step for the whole drag). */
    onchange: (points: Bezier, final: boolean) => void;
  } = $props();

  const W = 156, PAD = 12;
  // Value from −0.35 to 1.35: room for overshooting curves above and below, without a tall empty box.
  const Y0 = -0.35, Y1 = 1.35;
  const H = Math.round((W - PAD * 2) * (Y1 - Y0)) + PAD * 2;
  const sx = (x: number) => PAD + x * (W - PAD * 2);
  const sy = (y: number) => PAD + (Y1 - y) / (Y1 - Y0) * (H - PAD * 2);

  // Follows `value` (the effect below) except while a handle is being dragged.
  let points = $state<Bezier>([0.65, 0, 0.35, 1]);
  let dragging = $state<0 | 1 | null>(null);
  $effect(() => { if (dragging === null) points = [...value] as Bezier; });

  const path = $derived.by(() => {
    const name = bezierEase(points);
    let d = '';
    for (let i = 0; i <= 48; i++) { const u = i / 48; d += `${i ? 'L' : 'M'}${sx(u).toFixed(1)} ${sy(ease(name, u)).toFixed(1)}`; }
    return d;
  });

  let svg = $state<SVGSVGElement>();
  const local = (e: PointerEvent): [number, number] | null => {
    const m = svg?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [Math.max(0, Math.min(1, (p.x - PAD) / (W - PAD * 2))), Math.max(Y0, Math.min(Y1, Y1 - (p.y - PAD) / (H - PAD * 2) * (Y1 - Y0)))];
  };
  function grab(e: PointerEvent, which: 0 | 1) {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as Element;
    el.setPointerCapture(e.pointerId);
    dragging = which;
    const move = (ev: PointerEvent) => {
      const q = local(ev);
      if (!q) return;
      const next = [...points] as Bezier;
      next[which * 2] = q[0];
      next[which * 2 + 1] = q[1];
      points = next;
      onchange(points, false);
    };
    const up = () => {
      dragging = null;
      onchange(points, true);
      el.removeEventListener('pointermove', move as EventListener);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move as EventListener);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
  const f = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
</script>

<div class="bezier" data-custom={custom || undefined}>
  <svg bind:this={svg} width={W} height={H} viewBox="0 0 {W} {H}" role="group" aria-label={t('Custom curve')}>
    <rect class="box" x={sx(0)} y={sy(1)} width={sx(1) - sx(0)} height={sy(0) - sy(1)} />
    <line class="diagonal" x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} />
    <line class="arm" x1={sx(0)} y1={sy(0)} x2={sx(points[0])} y2={sy(points[1])} />
    <line class="arm" x1={sx(1)} y1={sy(1)} x2={sx(points[2])} y2={sy(points[3])} />
    <path class="curve" d={path} />
    {#each [0, 1] as which (which)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <circle class="handle" data-active={dragging === which || undefined} cx={sx(points[which * 2]!)} cy={sy(points[which * 2 + 1]!)} r="5"
        onpointerdown={(e) => grab(e, which as 0 | 1)}><title>{which ? t('End handle') : t('Start handle')}</title></circle>
    {/each}
  </svg>
  <span class="values">{f(points[0])}, {f(points[1])}, {f(points[2])}, {f(points[3])}</span>
</div>

<style>
  .bezier { display: flex; flex-direction: column; align-items: center; gap: var(--sv-space-4); align-self: stretch; justify-content: center; padding: var(--sv-space-4) var(--sv-space-6); border-right: var(--sv-border-1) solid var(--sv-rule-default); }
  svg { display: block; background: var(--sv-surface-field); touch-action: none; }
  .box { fill: none; stroke: var(--sv-rule-strong); stroke-width: 1; }
  .diagonal { stroke: var(--sv-text-muted); stroke-width: 1; stroke-dasharray: 2 3; }
  .arm { stroke: var(--sv-text-muted); stroke-width: 1; }
  .curve { fill: none; stroke: var(--sv-text-secondary); stroke-width: 2; }
  .bezier[data-custom] .curve { stroke: var(--sv-accent-fill); }
  .handle { fill: var(--sv-surface-panel); stroke: var(--sv-text-primary); stroke-width: 1.5; cursor: grab; }
  .handle:hover, .handle[data-active] { fill: var(--sv-accent-fill); }
  .handle[data-active] { cursor: grabbing; }
  .values { font-size: var(--sv-font-size-10); color: var(--sv-text-muted); font-variant-numeric: tabular-nums; }
</style>
