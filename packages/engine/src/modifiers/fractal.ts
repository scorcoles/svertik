import { apply as applyMat, IDENTITY, multiply, rotateScale, translate, type Mat } from '../matrix';
import { bounds, mapPoints, type Geometry, type Shape } from '../geometry';
import { defineModifier } from '../modifier';
import { fitViewBox } from './clone';

/** Copy cap: fractals grow exponentially (Carpet at 4 levels is already 4,096). */
export const FRACTAL_MAX_COPIES = 4096;

/**
 * Repeats the drawing inside itself, smaller each time (an iterated function system):
 * - sierpinski: 3 copies at half size (Sierpinski triangle); keeps the last level;
 * - carpet: 8 copies at a third around a hole (Sierpinski carpet); the last level;
 * - tree: two branches turned ±`angle` and scaled `ratio` on top of each one; every level;
 * - spiral: each copy turned `angle` and scaled `ratio` around a point to its right; all of them.
 * Each copy is an element (Step, Color…), in generation order. If it would exceed the cap, the depth drops.
 * With `fit`, the result shrinks to fit the original drawing's box (it doesn't leave the canvas).
 */
export const fractal = defineModifier({
  type: 'fractal',
  label: 'Fractal',
  kind: 'generator',
  reframe: true,
  params: {
    preset: { type: 'enum', default: 'sierpinski', options: ['sierpinski', 'carpet', 'tree', 'spiral'] as const, animatable: false },
    depth: { type: 'number', default: 4, min: 1, max: 12, step: 1, ramp: false, label: 'Depth' },
    ratio: { type: 'number', default: 0.7, min: 0.2, max: 0.95, step: 0.01, label: 'Scale', ramp: false },
    angle: { type: 'angle', default: 25, ramp: false },
    fit: { type: 'boolean', default: true, label: 'Fit', animatable: false },
  },
  apply(geo, p) {
    const b = bounds(geo);
    if (b.width <= 0 && b.height <= 0) return geo;
    const [w, h] = [b.width, b.height];
    const c: [number, number] = [b.x + w / 2, b.y + h / 2];
    const at = (pt: readonly [number, number]) => (m: Mat): Mat => multiply(translate(pt[0], pt[1]), multiply(m, translate(-pt[0], -pt[1])));
    const scaleAbout = (k: number, dx: number, dy: number): Mat => multiply(translate(dx, dy), at(c)([k, 0, 0, k, 0, 0]));

    let maps: Mat[];
    let keepAll = false;
    if (p.preset === 'carpet') {
      maps = [];
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (i || j) maps.push(scaleAbout(1 / 3, (i * w) / 3, (j * h) / 3));
    } else if (p.preset === 'tree') {
      // Branch: its base (bottom centre) goes to the top (top centre) of its parent, turned and scaled.
      const top: [number, number] = [c[0], b.y];
      const base: [number, number] = [c[0], b.y + h];
      const branch = (sign: number) => multiply(translate(top[0], top[1]), multiply(rotateScale(sign * p.angle, p.ratio), translate(-base[0], -base[1])));
      maps = [branch(-1), branch(1)];
      keepAll = true;
    } else if (p.preset === 'spiral') {
      // Turns and shrinks around a point to the right of the drawing: the copies coil towards it.
      const pivot: [number, number] = [b.x + w * 1.1, c[1]];
      maps = [at(pivot)(rotateScale(p.angle, p.ratio))];
      keepAll = true;
    } else {
      maps = [scaleAbout(0.5, 0, -h / 4), scaleAbout(0.5, -w / 4, h / 4), scaleAbout(0.5, w / 4, h / 4)];
    }

    // Depth that fits within the cap (spiral grows linearly, the rest exponentially).
    const k = maps.length;
    let depth = Math.max(1, Math.round(p.depth));
    const count = (d: number) => (k === 1 ? d + 1 : keepAll ? (k ** (d + 1) - 1) / (k - 1) : k ** d);
    while (depth > 1 && count(depth) > FRACTAL_MAX_COPIES) depth--;

    let level: Mat[] = [IDENTITY];
    const all: Mat[] = keepAll ? [IDENTITY] : [];
    for (let d = 0; d < depth; d++) {
      level = level.flatMap((m) => maps.map((t) => multiply(m, t)));
      if (keepAll) all.push(...level);
    }
    const copies = keepAll ? all : level;

    const shapes: Shape[] = [];
    copies.forEach((m, index) => {
      const moved = mapPoints(geo, (q) => applyMat(m, q));
      shapes.push(...moved.shapes.map((s) => ({ ...s, clone: index })));
    });
    let out: Geometry = { viewBox: geo.viewBox, shapes };
    // Fit: the whole fractal, shrunk (undistorted) and centred in the original drawing's box.
    if (p.fit) {
      const r = bounds(out);
      const k = Math.min(1, w / (r.width || 1), h / (r.height || 1));
      const rc: [number, number] = [r.x + r.width / 2, r.y + r.height / 2];
      out = mapPoints(out, ([x, y]) => [c[0] + (x - rc[0]) * k, c[1] + (y - rc[1]) * k]);
    }
    return { ...out, viewBox: fitViewBox(geo.viewBox, bounds(out)) };
  },
});
