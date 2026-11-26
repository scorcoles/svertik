<script lang="ts">
  // A small picture of a mesh effect's points (Envelope's 3×3, Perspective's four corners): the drawing's box
  // at rest, the warped grid the effect makes of it, and the points to drag. Double-click a point: back to rest.
  // ⇧ while dragging: only the axis that moved most changes. Alt+click: a key for that point at the playhead
  // (its animation diamond); animated points are turquoise diamonds, filled where there is a key now.
  import { t } from '@svertik/ui';
  import { squareToQuad, type Vec2 } from '@svertik/engine';

  type Kind = 'envelope' | 'perspective';
  let { kind, values, defaults, onchange, keyOf, onkey }: {
    kind: Kind;
    values: Record<string, unknown>;
    defaults: Record<string, [number, number]>;
    onchange: (name: string, value: [number, number]) => void;
    /** Each point's animation: none, animated, or a key at the playhead. */
    keyOf?: (name: string) => string | undefined;
    onkey?: (name: string) => void;
  } = $props();

  const NAMES: Record<Kind, string[]> = {
    envelope: ['p00', 'p10', 'p20', 'p01', 'p11', 'p21', 'p02', 'p12', 'p22'],
    perspective: ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'],
  };
  const LABELS: Record<string, string> = {
    p00: t('Top left'), p10: t('Top'), p20: t('Top right'), p01: t('Left'), p11: t('Middle'), p21: t('Right'), p02: t('Bottom left'), p12: t('Bottom'), p22: t('Bottom right'),
    topLeft: t('Top left'), topRight: t('Top right'), bottomRight: t('Bottom right'), bottomLeft: t('Bottom left'),
  };
  const names = $derived(NAMES[kind]);
  // A point as a pair of numbers (a formula counts as its rest value here).
  const pointOf = (name: string): Vec2 => {
    const v = values[name];
    return Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number' ? [v[0], v[1]] : defaults[name] ?? [0, 0];
  };
  const points = $derived(names.map(pointOf));

  // The effect's own mapping of the box (u, v in 0–1) to the warped one.
  const bern = (s: number) => [(1 - s) * (1 - s), 2 * s * (1 - s), s * s];
  const surface = $derived.by((): ((u: number, v: number) => Vec2) => {
    if (kind === 'perspective') return squareToQuad(points);
    return (u, v) => {
      const bu = bern(u), bv = bern(v);
      let x = 0, y = 0;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { const w = bu[i]! * bv[j]!, q = points[j * 3 + i]!; x += w * q[0]; y += w * q[1]; }
      return [x, y];
    };
  });
  const f = (n: number) => n.toFixed(4);
  const polyline = (pts: Vec2[]) => pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
  const STEPS = 24;
  const isoLines = $derived.by(() => {
    const lines: string[] = [];
    for (let k = 0; k <= 4; k++) {
      const a = k / 4;
      lines.push(polyline(Array.from({ length: STEPS + 1 }, (_, i) => surface(i / STEPS, a))));
      lines.push(polyline(Array.from({ length: STEPS + 1 }, (_, i) => surface(a, i / STEPS))));
    }
    return lines;
  });
  // Envelope's control net (its points are handles of curves, not on the grid).
  const net = $derived(kind === 'envelope'
    ? [0, 1, 2].flatMap((r) => [polyline([0, 1, 2].map((c) => points[r * 3 + c]!)), polyline([0, 1, 2].map((c) => points[c * 3 + r]!))])
    : []);

  // The view: the rest box and every point, with room around them.
  const view = $derived.by(() => {
    const xs = [0, 1, ...points.map((p) => p[0])], ys = [0, 1, ...points.map((p) => p[1])];
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const side = Math.max(x1 - x0, y1 - y0) * 1.3;
    return { x: (x0 + x1) / 2 - side / 2, y: (y0 + y1) / 2 - side / 2, side };
  });

  let svg = $state<SVGSVGElement>();
  let dragging = $state<string | null>(null);
  // The view stays as it was while a point is dragged (otherwise it would slide under the pointer).
  let frozen = $state<typeof view | null>(null);
  const shown = $derived(frozen ?? view);
  const toLocal = (e: PointerEvent): Vec2 | null => {
    const m = svg?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  const round = (n: number) => Math.round(n * 100) / 100;
  function grab(e: PointerEvent, name: string) {
    e.preventDefault();
    if (e.altKey && onkey) { onkey(name); return; }
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragging = name;
    frozen = view;
    const start = pointOf(name);
    const from = toLocal(e);
    const move = (ev: PointerEvent) => {
      const to = toLocal(ev);
      if (!to || !from) return;
      let x = start[0] + to[0] - from[0], y = start[1] + to[1] - from[1];
      if (ev.shiftKey) { if (Math.abs(x - start[0]) >= Math.abs(y - start[1])) y = start[1]; else x = start[0]; }
      onchange(name, [round(x), round(y)]);
    };
    const el = e.currentTarget as Element;
    const up = () => {
      dragging = null;
      frozen = null;
      el.removeEventListener('pointermove', move as EventListener);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move as EventListener);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
</script>

<div class="mesh">
  <svg bind:this={svg} viewBox="{shown.x} {shown.y} {shown.side} {shown.side}" role="group" aria-label={t('Mesh')}>
    <rect class="rest" x="0" y="0" width="1" height="1" />
    {#each net as line, i (i)}<polyline class="net" points={line} />{/each}
    {#each isoLines as line, i (i)}<polyline class="grid" data-edge={i < 2 || i >= isoLines.length - 2 || undefined} points={line} />{/each}
    {#each names as name, i (name)}
      {@const [x, y] = points[i]!}
      {@const state = keyOf?.(name)}
      {@const animated = state === 'animated' || state === 'key'}
      {@const r = shown.side * (animated ? 0.04 : 0.03)}
      <!-- A circle, or a diamond once the point is animated (like the parameter's diamond). -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <path class="point" data-active={dragging === name || undefined} data-key={animated ? state : undefined}
        d={animated
          ? `M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`
          : `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`}
        onpointerdown={(e) => grab(e, name)} ondblclick={() => onchange(name, [...(defaults[name] ?? [0, 0])] as [number, number])}>
        <title>{LABELS[name] ?? name} · {x.toFixed(2)}, {y.toFixed(2)}{onkey ? ` · ${t('Alt+click: key')}` : ''}</title>
      </path>
    {/each}
  </svg>
</div>

<style>
  .mesh { padding: var(--sv-space-4) var(--sv-space-8) var(--sv-space-8); }
  svg { display: block; width: 100%; max-width: 280px; aspect-ratio: 1; margin: 0 auto; background: var(--sv-surface-field); border: var(--sv-border-1) solid var(--sv-rule-default); touch-action: none; }
  .rest { fill: none; stroke: var(--sv-text-muted); stroke-width: 1px; stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
  .net { fill: none; stroke: var(--sv-text-muted); stroke-width: 1px; stroke-dasharray: 1 3; vector-effect: non-scaling-stroke; }
  .grid { fill: none; stroke: var(--sv-accent-fill); stroke-width: 1px; opacity: 0.55; vector-effect: non-scaling-stroke; }
  .grid[data-edge] { opacity: 1; stroke-width: 1.5px; }
  .point { fill: var(--sv-surface-panel); stroke: var(--sv-text-primary); stroke-width: 1.5px; vector-effect: non-scaling-stroke; cursor: grab; }
  .point:hover { fill: var(--sv-accent-fill); }
  .point[data-active] { fill: var(--sv-accent-fill); cursor: grabbing; }
  /* Animated: a turquoise diamond outline; with a key at the playhead, filled (like the parameter's diamond). */
  .point[data-key] { stroke: var(--sv-accent-fill); stroke-width: 2.5px; }
  .point[data-key='key'] { fill: var(--sv-accent-fill); }
</style>
