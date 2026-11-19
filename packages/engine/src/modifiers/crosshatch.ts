import { line, mapPoints, type Geometry, type Shape, type Style, type SubPath, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';
import { colorSampler, darkness, prepare, type Layer } from './halftone';
import { apply, invert } from '../matrix';

/** Each extra layer turns the hatching by this much from the first one. */
const LAYER_TURN = [0, 90, 45, -45];
/** Samples per call at most (layers × lines × steps); beyond it the walk takes longer steps. */
const BUDGET = 200000;

/**
 * Crosshatch: the drawing shaded with parallel lines, like a pen drawing. Up to four layers of
 * hatching at different angles (the first at `angle`, then +90°, +45°, −45°); each layer only draws
 * where the tone is darker than its threshold, so light areas get one set of lines and the darkest
 * get all of them. Thresholds are spread evenly: with 3 layers at 25%, 50% and 75% darkness.
 * Lines are `spacing` px apart and `width` px wide; `color` takes the colour below or one ink.
 * Each run of line is its own element (Step, Trim… act line by line) unless `merge` is on.
 * Hand-drawn wobble is Roughen's job: put it after this effect.
 */
export const crosshatch = defineModifier({
  type: 'crosshatch',
  label: 'Crosshatch',
  kind: 'generator',
  params: {
    spacing: { type: 'number', default: 6, min: 1, max: 100, step: 0.5, unit: 'px', label: 'Spacing', random: [3, 12] },
    angle: { type: 'angle', default: 45, label: 'Angle', ramp: false, random: [0, 180] },
    layers: { type: 'number', default: 3, min: 1, max: 4, step: 1, label: 'Layers', random: [1, 4] },
    width: { type: 'number', default: 1, min: 0.1, max: 20, step: 0.1, unit: 'px', label: 'Line width', random: [0.5, 2] },
    gamma: { type: 'number', default: 1, min: 0.1, max: 4, step: 0.05, label: 'Gamma', random: [0.7, 1.6] },
    color: { type: 'enum', default: 'ink', options: ['ink', 'original'] as const, label: 'Color', animatable: false },
    ink: { type: 'color', default: '#111111', label: 'Ink', showIf: { color: ['ink'] } },
    invert: { type: 'boolean', default: false, label: 'Invert' },
    offset: { type: 'point', default: [0, 0], unit: 'fraction', step: 0.01, label: 'Offset', handle: false, random: false },
    fixLines: { type: 'boolean', default: false, label: 'Fix lines', animatable: false, random: false },
    merge: { type: 'boolean', default: false, label: 'Merge lines', animatable: false, random: false },
  },
  apply(geo, p, ctx): Geometry {
    if (!(p.spacing >= 0.5) || !(p.width > 0) || !geo.shapes.length) return geo;
    if (!p.fixLines && geo.shapes.some((s) => s.patternTransform)) {
      // Gravity and Transform move material inside the stack, independently of node placement.
      // Hatch each material frame before its motion, then put its lines back on the fragment.
      const groups = new Map<string, Shape[]>();
      for (const shape of geo.shapes) {
        const key = JSON.stringify(shape.patternTransform ?? null);
        const group = groups.get(key) ?? [];
        group.push(shape); groups.set(key, group);
      }
      const shapes: Shape[] = [];
      for (const group of groups.values()) {
        const matrix = group[0]!.patternTransform;
        const inverse = matrix ? invert(matrix) : undefined;
        const input = { ...geo, shapes: group.map(({ patternTransform: _, ...shape }) => shape) };
        const material = inverse ? mapPoints(input, (q) => apply(inverse, q)) : input;
        const result = crosshatch.apply(material, { ...p, merge: false }, ctx);
        const placed = matrix ? mapPoints(result, (q) => apply(matrix, q)) : result;
        for (const shape of placed.shapes) shapes.push({ ...shape, ...(matrix ? { patternTransform: matrix } : {}), clone: shapes.length });
      }
      return mergeLines({ viewBox: geo.viewBox, shapes }, p.merge);
    }
    const layers = geo.shapes.map((s) => prepare(s, 0.25)).filter((l): l is Layer => !!l);
    if (!layers.length) return { viewBox: geo.viewBox, shapes: [] };
    const paintAt = colorSampler(layers, p.color !== 'ink');
    // Sample paint in object space, but construct a fixed screen in scene space.
    const world = p.fixLines ? ctx.scene?.world : undefined;
    const inverse = world ? invert(world) : undefined;
    const local = (q: Vec2): Vec2 => inverse ? apply(inverse, q) : q;
    const widthScale = world ? Math.hypot(world[0], world[1]) || 1 : 1;

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const l of layers) (x0 = Math.min(x0, l.box[0])), (y0 = Math.min(y0, l.box[1])), (x1 = Math.max(x1, l.box[2])), (y1 = Math.max(y1, l.box[3]));
    if (world) {
      const boxCorners: Vec2[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const corners = boxCorners.map((q) => apply(world, q));
      x0 = Math.min(...corners.map((q) => q[0])); y0 = Math.min(...corners.map((q) => q[1]));
      x1 = Math.max(...corners.map((q) => q[0])); y1 = Math.max(...corners.map((q) => q[1]));
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    // Every hatching direction covers a circle around the bounds, so one extent serves them all.
    const reach = Math.hypot(x1 - x0, y1 - y0) / 2 + p.spacing;
    const count = Math.max(1, Math.min(4, Math.round(p.layers)));

    let step = Math.max(1, Math.min(4, p.spacing / 2));
    const lines = Math.ceil((2 * reach) / p.spacing) + 1;
    while (count * lines * ((2 * reach) / step) > BUDGET) step *= 1.25;

    /** Darkness after invert and gamma, and the paint below; null off the drawing. */
    const sample = (q: Vec2): { t: number; key: string; style: Style } | null => {
      const hit = paintAt(local(q));
      if (!hit) return null;
      const d = darkness(hit.rgba);
      const t = Math.max(0, Math.min(1, Math.pow(p.invert ? 1 - d : d, p.gamma)));
      const fill = hit.style.fill ?? '#000000';
      const op = hit.style.opacity;
      return { t, key: p.color === 'ink' ? '' : `${fill}|${op ?? ''}`, style: hit.style };
    };
    const styleFor = (base: Style): Style => {
      const style: Style = { fill: 'none', stroke: p.color === 'ink' ? p.ink : (base.fill ?? '#000000'), 'stroke-width': String(p.width / widthScale) };
      if (p.color !== 'ink' && base.opacity) style.opacity = base.opacity;
      if (base['mix-blend-mode']) style['mix-blend-mode'] = base['mix-blend-mode'];
      return style;
    };

    const shapes: Shape[] = [];
    let n = 0;
    for (let k = 0; k < count; k++) {
      const threshold = (k + 1) / (count + 1);
      const rad = ((p.angle + LAYER_TURN[k]!) * Math.PI) / 180;
      const ux = Math.cos(rad), uy = Math.sin(rad); // along the lines
      const vx = -uy, vy = ux; // across them
      // The offset moves the lines across, as a fraction of the spacing (from the box origin).
      const originX = p.fixLines ? 0 : ctx.bounds.x, originY = p.fixLines ? 0 : ctx.bounds.y;
      const shift = ((originX - cx + (p.offset[0] % 1) * p.spacing) * vx + (originY - cy + (p.offset[1] % 1) * p.spacing) * vy) % p.spacing;
      const at = (s: number, v: number): Vec2 => [cx + ux * s + vx * v, cy + uy * s + vy * v];
      const key = (q: Vec2) => {
        const h = sample(q);
        return h && h.t > threshold ? h : null;
      };
      const j0 = Math.floor((-reach - shift) / p.spacing), j1 = Math.ceil((reach - shift) / p.spacing);
      for (let j = j0; j <= j1; j++) {
        const v = shift + j * p.spacing;
        if (Math.abs(v) > reach) continue;
        const half = Math.sqrt(Math.max(0, reach * reach - v * v));
        let runStart = -half;
        let run: { key: string; style: Style } | null = null;
        let prev = -half;
        const close = (end: number) => {
          if (run && end - runStart > 1e-3) {
            const a = local(at(runStart, v)), b = local(at(end, v));
            shapes.push({ style: styleFor(run.style), subpaths: [{ start: a, segs: [line(a, b)], closed: false } as SubPath], clone: n++ });
          }
        };
        for (let s = -half; ; s = Math.min(half, s + step)) {
          const h = key(at(s, v));
          const id = h ? h.key : null;
          if ((run ? run.key : null) !== id) {
            // The change lies between the previous sample and this one: narrow it down.
            let lo = prev, hi = s;
            const was = run ? run.key : null;
            if (s > -half) {
              for (let it = 0; it < 6; it++) {
                const mid = (lo + hi) / 2;
                const m = key(at(mid, v));
                if ((m ? m.key : null) === was) lo = mid;
                else hi = mid;
              }
            }
            const edge = (lo + hi) / 2;
            close(edge);
            run = h ? { key: h.key, style: h.style } : null;
            runStart = edge;
          }
          prev = s;
          if (s >= half) break;
        }
        close(half);
      }
    }
    return mergeLines({ viewBox: geo.viewBox, shapes }, p.merge);
  },
});

function mergeLines(geo: Geometry, merge: boolean): Geometry {
  if (!merge) return geo;
  // Merge: one path per style, in first-seen order. A merged path can span material frames.
  const byStyle = new Map<string, Shape>();
  for (const s of geo.shapes) {
    const k = JSON.stringify(s.style);
    const g = byStyle.get(k);
    if (g) g.subpaths.push(...s.subpaths);
    else byStyle.set(k, { style: s.style, subpaths: [...s.subpaths], clone: byStyle.size });
  }
  return { viewBox: geo.viewBox, shapes: [...byStyle.values()] };
}
