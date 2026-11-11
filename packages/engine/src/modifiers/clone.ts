import { bounds, flatten, insidePolygons, mapPoints, type Geometry, type Shape, type Vec2 } from '../geometry';
import { pointAt, polylines } from '../paths';
import { rng } from '../random';
import { defineModifier, deg } from '../modifier';

/**
 * Duplicates the drawing: in a grid, a circle or a line.
 * The copies spread around the original and the viewBox grows to fit them.
 * In `object` mode, on another object: along its outline, on its vertices or inside it (random, with a seed).
 */
export const clone = defineModifier({
  type: 'clone',
  label: 'Clone',
  kind: 'generator',
  reframe: true,
  params: {
    mode: { type: 'enum', default: 'grid', options: ['grid', 'radial', 'linear', 'object'] as const, animatable: false },
    count: { type: 'number', default: 6, min: 1, max: 64, step: 1, label: 'Count', ramp: false },
    columns: { type: 'number', default: 3, min: 1, max: 16, step: 1, group: 'Grid', ramp: false },
    rows: { type: 'number', default: 3, min: 1, max: 16, step: 1, group: 'Grid', ramp: false },
    spacing: { type: 'point', default: [1.1, 1.1], unit: 'fraction', group: 'Grid', label: 'Spacing', handle: false, linkable: true },
    radius: { type: 'number', default: 1, min: 0, max: 5, step: 0.01, unit: 'fraction', group: 'Radial', ramp: false },
    align: { type: 'boolean', default: true, label: 'Align' },
    startAngle: { type: 'angle', default: 0, group: 'Radial', label: 'Start' },
    offset: { type: 'point', default: [1.1, 0], unit: 'fraction', group: 'Linear', label: 'Offset', handle: false },
    scaleStep: { type: 'number', default: 1, min: 0, max: 2, step: 0.01, group: 'Linear', label: 'Scale step' },
    rotateStep: { type: 'angle', default: 0, group: 'Linear', label: 'Rotate step' },
    even: { type: 'boolean', default: false, group: 'Linear', label: 'Even gaps', animatable: false },
    target: { type: 'node', default: '', group: 'Object', label: 'Object' },
    place: { type: 'enum', default: 'contour', options: ['contour', 'vertices', 'inside'] as const, group: 'Object', label: 'Place', animatable: false },
    seed: { type: 'seed', default: 1, group: 'Object' },
  },
  apply(geo, p, ctx) {
    const b = bounds(geo);
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const W = ctx.bounds.width;
    const H = ctx.bounds.height;
    const size = Math.max(W, H);

    // Each copy: offset, rotation and scale around the centre of the drawing.
    const copies: { dx: number; dy: number; rot: number; scale: number }[] = [];
    if (p.mode === 'grid') {
      const cols = Math.max(1, Math.round(p.columns));
      const rows = Math.max(1, Math.round(p.rows));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          copies.push({ dx: (c - (cols - 1) / 2) * p.spacing[0] * W, dy: (r - (rows - 1) / 2) * p.spacing[1] * H, rot: 0, scale: 1 });
        }
      }
    } else if (p.mode === 'radial') {
      const n = Math.max(1, Math.round(p.count));
      const R = p.radius * size;
      for (let i = 0; i < n; i++) {
        const a = deg(p.startAngle) + (i / n) * Math.PI * 2;
        copies.push({ dx: Math.cos(a) * R, dy: Math.sin(a) * R, rot: p.align ? a + Math.PI / 2 : 0, scale: 1 });
      }
    } else if (p.mode === 'object') {
      const target = p.target ? ctx.target?.(p.target) : null;
      if (!target) return geo;
      const n = Math.max(1, Math.round(p.count));
      // The copies are centred on each point (the drawing's centre goes to the point).
      const at = (q: Vec2, rot = 0) => copies.push({ dx: q[0] - cx, dy: q[1] - cy, rot, scale: 1 });
      if (p.place === 'vertices') {
        for (const s of target.shapes) for (const sp of s.subpaths) {
          at(sp.start);
          // In closed paths the last vertex repeats the first.
          sp.segs.forEach((g, i) => (!sp.closed || i < sp.segs.length - 1) && at(g.p));
        }
      } else if (p.place === 'inside') {
        const polys = target.shapes.flatMap((s) => s.subpaths.filter((sp) => sp.closed).map((sp) => flatten(sp, 8)));
        const tb = bounds(target);
        const rand = rng(p.seed);
        for (let tries = 0; copies.length < n && tries < n * 200; tries++) {
          const q: Vec2 = [tb.x + rand() * tb.width, tb.y + rand() * tb.height];
          if (insidePolygons(polys, q)) at(q);
        }
      } else {
        // Outline: spread at equal distances along all its paths, as if they were one.
        const lines = polylines(target);
        const total = lines.reduce((sum, l) => sum + l.length, 0);
        const open = lines.length === 1 && !lines[0]!.closed;
        const gap = total / Math.max(1, open ? n - 1 : n);
        for (let i = 0; i < n; i++) {
          let d = i * gap;
          const l = lines.find((x) => (d <= x.length ? true : ((d -= x.length), false))) ?? lines[lines.length - 1]!;
          const { p: q, t } = pointAt(l, Math.min(d, l.length));
          at(q, p.align ? Math.atan2(t[1], t[0]) : 0);
        }
      }
    } else {
      const n = Math.max(1, Math.round(p.count));
      const ox = p.offset[0] * W, oy = p.offset[1] * H;
      const d = Math.hypot(ox, oy);
      if (p.even && d > 0 && n > 1) {
        // Equal gaps between copies of different sizes: each step is the gap (the scale-1 one)
        // plus half a copy on each side, at its scale. Then the whole set is centred.
        const [ux, uy] = [ox / d, oy / d];
        const extent = Math.abs(ux) * b.width + Math.abs(uy) * b.height;
        const gap = d - extent;
        const scales = Array.from({ length: n }, (_, i) => Math.pow(p.scaleStep, i));
        const pos = [0];
        for (let i = 1; i < n; i++) pos.push(pos[i - 1]! + gap + (extent * (scales[i - 1]! + scales[i]!)) / 2);
        const mid = (pos[0]! + pos[n - 1]!) / 2;
        for (let i = 0; i < n; i++) copies.push({ dx: ux * (pos[i]! - mid), dy: uy * (pos[i]! - mid), rot: deg(p.rotateStep) * i, scale: scales[i]! });
      } else {
        for (let i = 0; i < n; i++) {
          const t = i - (n - 1) / 2;
          copies.push({ dx: t * ox, dy: t * oy, rot: deg(p.rotateStep) * i, scale: Math.pow(p.scaleStep, i) });
        }
      }
    }

    const shapes: Shape[] = [];
    for (const [index, k] of copies.entries()) {
      const c = Math.cos(k.rot) * k.scale;
      const s = Math.sin(k.rot) * k.scale;
      const moved = mapPoints(geo, ([x, y]) => {
        const ux = x - cx;
        const uy = y - cy;
        return [cx + ux * c - uy * s + k.dx, cy + ux * s + uy * c + k.dy];
      });
      shapes.push(...moved.shapes.map((s) => ({ ...s, clone: index })));
    }

    const out: Geometry = { viewBox: geo.viewBox, shapes };
    return { ...out, viewBox: fitViewBox(geo.viewBox, bounds(out)) };
  },
});

/** Grows the viewBox just enough to fit everything, with a 5 % margin. */
export function fitViewBox([x, y, w, h]: [number, number, number, number], b: { x: number; y: number; width: number; height: number }): [number, number, number, number] {
  const m = Math.max(b.width, b.height) * 0.05;
  const x0 = Math.min(x, b.x - m);
  const y0 = Math.min(y, b.y - m);
  const x1 = Math.max(x + w, b.x + b.width + m);
  const y1 = Math.max(y + h, b.y + b.height + m);
  if (x0 === x && y0 === y && x1 === x + w && y1 === y + h) return [x, y, w, h];
  const r = (n: number) => Math.round(n * 100) / 100;
  return [r(x0), r(y0), r(x1 - x0), r(y1 - y0)];
}
