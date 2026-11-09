import { bounds, mapPoints, type Geometry, type Shape } from '../geometry';
import { defineModifier, deg } from '../modifier';

/**
 * Duplica el dibujo: en rejilla, en círculo o en línea (como el Cloner de C4D).
 * Las copias se reparten alrededor del original y el viewBox crece para que quepan.
 */
export const clone = defineModifier({
  type: 'clone',
  label: 'Clone',
  kind: 'generator',
  params: {
    mode: { type: 'enum', default: 'grid', options: ['grid', 'radial', 'linear'] as const, animatable: false },
    count: { type: 'number', default: 6, min: 1, max: 64, step: 1, label: 'Count', ramp: false },
    columns: { type: 'number', default: 3, min: 1, max: 16, step: 1, group: 'Grid', ramp: false },
    rows: { type: 'number', default: 3, min: 1, max: 16, step: 1, group: 'Grid', ramp: false },
    spacing: { type: 'point', default: [1.1, 1.1], unit: 'fraction', group: 'Grid', label: 'Spacing' },
    radius: { type: 'number', default: 1, min: 0, max: 5, step: 0.01, unit: 'fraction', group: 'Radial', ramp: false },
    align: { type: 'boolean', default: true, group: 'Radial', label: 'Align' },
    startAngle: { type: 'angle', default: 0, group: 'Radial', label: 'Start' },
    offset: { type: 'point', default: [1.1, 0], unit: 'fraction', group: 'Linear', label: 'Offset' },
    scaleStep: { type: 'number', default: 1, min: 0, max: 2, step: 0.01, group: 'Linear', label: 'Scale step' },
    rotateStep: { type: 'angle', default: 0, group: 'Linear', label: 'Rotate step' },
  },
  apply(geo, p, ctx) {
    const b = bounds(geo);
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const W = ctx.bounds.width;
    const H = ctx.bounds.height;
    const size = Math.max(W, H);

    // Cada copia: desplazamiento, giro y escala alrededor del centro del dibujo.
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
    } else {
      const n = Math.max(1, Math.round(p.count));
      for (let i = 0; i < n; i++) {
        const t = i - (n - 1) / 2;
        copies.push({ dx: t * p.offset[0] * W, dy: t * p.offset[1] * H, rot: deg(p.rotateStep) * i, scale: Math.pow(p.scaleStep, i) });
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

/** Amplía el viewBox lo justo para que quepa todo, con un margen del 5 %. */
function fitViewBox([x, y, w, h]: [number, number, number, number], b: { x: number; y: number; width: number; height: number }): [number, number, number, number] {
  const m = Math.max(b.width, b.height) * 0.05;
  const x0 = Math.min(x, b.x - m);
  const y0 = Math.min(y, b.y - m);
  const x1 = Math.max(x + w, b.x + b.width + m);
  const y1 = Math.max(y + h, b.y + b.height + m);
  if (x0 === x && y0 === y && x1 === x + w && y1 === y + h) return [x, y, w, h];
  const r = (n: number) => Math.round(n * 100) / 100;
  return [r(x0), r(y0), r(x1 - x0), r(y1 - y0)];
}
