import { isPathContours, type PathContour } from './manual-path';
import { shapeRegistry } from './shapes';
import type { Vec2 } from './geometry';
import { linearOf } from './document';
import type { Placement } from './scene';

/**
 * A primitive's parameters resized by `sx` × `sy` around its own origin: its size values change, not its scale,
 * so formulas that read them (`this.radius - 50`) keep working. Numbers are multiplied; formulas and percentages
 * stay as they are (they follow by themselves). Stroke width and other style values don't change.
 * Null when the shape can't take that resize through its values (a Donut stretched on one axis, an unknown
 * shape): the caller then falls back to the transform's scale or stretch.
 */
export function resizeShapeParams(shape: string, params: Record<string, unknown>, sx: number, sy: number): Record<string, unknown> | null {
  if (!(sx > 0) || !(sy > 0) || !Number.isFinite(sx) || !Number.isFinite(sy)) return null;
  const uniform = Math.abs(sx - sy) < 1e-9;
  if (shape === 'path') {
    const contours = params.contours ?? shapeRegistry.get('path')?.params.contours?.default;
    if (!isPathContours(contours)) return null;
    const scale = (v: Vec2): Vec2 => [v[0] * sx, v[1] * sy];
    const next: PathContour[] = contours.map((c) => ({ ...c, points: c.points.map((p) => ({ ...p, point: scale(p.point), in: scale(p.in), out: scale(p.out) })) }));
    return { ...params, contours: next };
  }
  const def = shapeRegistry.get(shape);
  const spec = def?.resize;
  if (!def || !spec) return null;
  if (!uniform && spec.both?.length) return null;
  const out = { ...params };
  const times = (names: string[] | undefined, k: number) => {
    for (const name of names ?? []) {
      const given = out[name];
      const fallback = def.params[name]?.type === 'number' ? (def.params[name] as { default: number }).default : undefined;
      const value = given === undefined ? fallback : given;
      // A default that doesn't change (a corner radius of 0) stays unset.
      if (typeof value === 'number' && Number.isFinite(value) && (given !== undefined || value * k !== value)) out[name] = value * k;
    }
  };
  times(spec.x, sx);
  times(spec.y, sy);
  times(spec.both, sx);
  times(spec.least, Math.min(sx, sy));
  return out;
}

/** True when the shape can be resized through its values (uniformly, or also per axis). */
export function shapeResizes(shape: string): { uniform: boolean; axes: boolean } {
  if (shape === 'path') return { uniform: true, axes: true };
  const spec = shapeRegistry.get(shape)?.resize;
  if (!spec) return { uniform: false, axes: false };
  return { uniform: true, axes: !spec.both?.length };
}

/**
 * How far to move a node (in its parent's space, added to x and y) after resizing its values by `sx` × `sy`,
 * so it looks as if it had been scaled around `fixed`: the pivot for a corner, the opposite edge for an edge.
 * All points are in the node's local coordinates, before the resize: `pivot` (its transform centre) and `origin`
 * (the point placed at x, y: the centre of its box, or the shape's own origin). The shape grows around its
 * local (0, 0), as its values do.
 */
export function resizeOffset(placement: Placement, pivot: Vec2, origin: Vec2, fixed: Vec2, sx: number, sy: number): Vec2 {
  const L = linearOf(placement);
  const a: Vec2 = [-(sx - 1) * (pivot[0] - origin[0]), -(sy - 1) * (pivot[1] - origin[1])];
  const d: Vec2 = [(sx - 1) * (fixed[0] - pivot[0]), (sy - 1) * (fixed[1] - pivot[1])];
  return [a[0] - (L[0] * d[0] + L[2] * d[1]), a[1] - (L[1] * d[0] + L[3] * d[1])];
}
