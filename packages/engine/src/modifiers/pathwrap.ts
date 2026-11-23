import { mapPoints, subdivide } from '../geometry';
import { defineModifier } from '../modifier';
import { pointAt, polylines } from '../paths';

/**
 * Wraps the drawing along another object's path.
 * The drawing's axis (horizontal or vertical) follows the path; what is across it moves away from it.
 * `stretch`: the drawing covers the whole path; `keep`: keeps its length and starts at `offset`.
 */
export const pathwrap = defineModifier({
  type: 'pathwrap',
  label: 'Path Wrap',
  kind: 'deformer',
  params: {
    target: { type: 'node', default: '', label: 'Path' },
    axis: { type: 'enum', default: 'horizontal', options: ['horizontal', 'vertical'] as const, animatable: false },
    fit: { type: 'enum', default: 'stretch', options: ['stretch', 'keep'] as const, animatable: false },
    offset: { type: 'number', default: 0, min: -1, max: 1, step: 0.01, unit: 'fraction' },
  },
  apply(geo, p, ctx) {
    const target = p.target ? ctx.target?.(p.target) : null;
    if (!target) return geo;
    // The object's longest path.
    const line = polylines(target).sort((a, b) => b.length - a.length)[0];
    if (!line) return geo;
    const b = ctx.bounds;
    const horizontal = p.axis !== 'vertical';
    const along = horizontal ? b.width : b.height;
    if (along <= 0) return geo;
    const L = line.length;
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    // Fine enough to follow the path's curves.
    const res = Math.min(ctx.resolution, (L / 200) * (along / L || 1));
    return mapPoints(subdivide(geo, Math.max(res, 1e-3)), ([x, y]) => {
      const u = (horizontal ? x - b.x : y - b.y) / along;
      const v = horizontal ? y - cy : cx - x;
      const s = p.fit === 'keep' ? p.offset * L + u * along : (p.offset + u) * L;
      const { p: q, t } = pointAt(line, s);
      // Normal: the tangent turned 90° (downwards if the path goes right).
      return [q[0] - t[1] * v, q[1] + t[0] * v];
    });
  },
});

