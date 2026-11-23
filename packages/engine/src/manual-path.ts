import type { SubPath, Vec2 } from './geometry';

export type PathPointMode = 'corner' | 'free' | 'smooth' | 'symmetric';
/** Handles are offsets from the anchor, in local pixels. */
export interface PathPoint { id?: string; point: Vec2; in: Vec2; out: Vec2; mode: PathPointMode }
export interface PathContour { closed: boolean; points: PathPoint[] }
export const pathPoint = (x: number, y: number): PathPoint => ({ point: [x, y], in: [0, 0], out: [0, 0], mode: 'corner' });
const vector = (v: unknown): v is Vec2 => Array.isArray(v) && v.length === 2 && v.every(x => typeof x === 'number' && Number.isFinite(x));
export function isPathContours(value: unknown): value is PathContour[] {
  return Array.isArray(value) && value.every(c => c && typeof c.closed === 'boolean' && Array.isArray(c.points) && c.points.every((p: PathPoint) => p && (p.id === undefined || typeof p.id === 'string' && /^[^:]+$/.test(p.id)) && vector(p.point) && vector(p.in) && vector(p.out) && ['corner', 'free', 'smooth', 'symmetric'].includes(p.mode)));
}
const plus = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const minus = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const mix = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export function manualPathParts(contours: PathContour[]): SubPath[] {
  if (!isPathContours(contours)) return [];
  return contours.filter(c => c.points.length >= 2).map(c => ({
    start: [...c.points[0]!.point] as Vec2,
    closed: c.closed,
    segs: Array.from({ length: c.closed ? c.points.length : c.points.length - 1 }, (_, i) => {
      const a = c.points[i]!, b = c.points[(i + 1) % c.points.length]!;
      return { c1: plus(a.point, a.mode === 'corner' ? [0, 0] : a.out), c2: plus(b.point, b.mode === 'corner' ? [0, 0] : b.in), p: [...b.point] as Vec2 };
    }),
  }));
}
/** Change a handle; smooth mirrors angle only, symmetric mirrors angle and length. */
export function movePathHandle(point: PathPoint, side: 'in' | 'out', offset: Vec2, independent = false): PathPoint {
  const other = side === 'in' ? 'out' : 'in';
  const mode = independent || point.mode === 'corner' ? 'free' : point.mode;
  const next = { ...point, mode, [side]: offset };
  const length = Math.hypot(...offset);
  if ((mode === 'smooth' || mode === 'symmetric') && length > 0) {
    const oppositeLength = mode === 'symmetric' ? length : Math.hypot(...point[other]);
    next[other] = [-offset[0] * oppositeLength / length, -offset[1] * oppositeLength / length];
  } else if (mode === 'symmetric') next[other] = [0, 0];
  return next;
}
export function setPathPointMode(contour: PathContour, index: number, mode: PathPointMode): PathPoint {
  const p = contour.points[index]!;
  if (mode === 'corner') return { ...p, mode, in: [0, 0], out: [0, 0] };
  if (mode === 'free') {
    if (p.mode === 'corner') return { ...setPathPointMode(contour, index, 'symmetric'), mode };
    return { ...p, mode };
  }
  const previous = index > 0 ? contour.points[index - 1] : contour.closed ? contour.points.at(-1) : undefined;
  const next = index + 1 < contour.points.length ? contour.points[index + 1] : contour.closed ? contour.points[0] : undefined;
  let direction: Vec2 = Math.hypot(...p.out) ? p.out : Math.hypot(...p.in) ? [-p.in[0], -p.in[1]] : minus(next?.point ?? p.point, previous?.point ?? p.point);
  const length = Math.hypot(...direction) || 1;
  direction = [direction[0] / length, direction[1] / length];
  const inLength = Math.hypot(...p.in) || (previous ? Math.hypot(...minus(previous.point, p.point)) / 3 : 30);
  const outLength = Math.hypot(...p.out) || (next ? Math.hypot(...minus(next.point, p.point)) / 3 : 30);
  const a = mode === 'symmetric' ? (inLength + outLength) / 2 : inLength;
  const b = mode === 'symmetric' ? a : outLength;
  return { ...p, mode, in: [-direction[0] * a, -direction[1] * a], out: [direction[0] * b, direction[1] * b] };
}
/** De Casteljau subdivision preserves the original cubic exactly. */
export function insertPathPoint(contour: PathContour, segment: number, t = 0.5): PathContour {
  if (segment < 0 || segment >= (contour.closed ? contour.points.length : contour.points.length - 1)) return contour;
  const points = structuredClone(contour.points);
  const a = points[segment]!, b = points[(segment + 1) % points.length]!;
  const c1 = plus(a.point, a.mode === 'corner' ? [0, 0] : a.out), c2 = plus(b.point, b.mode === 'corner' ? [0, 0] : b.in);
  const ab = mix(a.point, c1, t), bc = mix(c1, c2, t), cd = mix(c2, b.point, t);
  const abc = mix(ab, bc, t), bcd = mix(bc, cd, t), at = mix(abc, bcd, t);
  // Splitting can change lengths independently, so preserve geometry rather than symmetry metadata.
  a.mode = 'free'; a.out = minus(ab, a.point);
  b.mode = 'free'; b.in = minus(cd, b.point);
  points.splice(segment + 1, 0, { point: at, in: minus(abc, at), out: minus(bcd, at), mode: 'smooth' });
  return { ...contour, points };
}

/** Stable point targets use the normal shape track channel; array indices are never stored in tracks. */
export const pathPointParam = (id: string, field: 'point' | 'in' | 'out' = 'point') => `point:${id}:${field}`;
export function parsePathPointParam(param: string): { id: string; field: 'point' | 'in' | 'out' } | null {
  const match = /^point:([^:]+):(point|in|out)$/.exec(param);
  return match ? { id: match[1]!, field: match[2] as 'point' | 'in' | 'out' } : null;
}
export function readPathPointTarget(contours: unknown, param: string): Vec2 | undefined {
  const target = parsePathPointParam(param);
  if (!target || !isPathContours(contours)) return undefined;
  return contours.flatMap(c => c.points).find(p => p.id === target.id)?.[target.field];
}
export function writePathPointTarget(contours: unknown, param: string, value: unknown): boolean {
  const target = parsePathPointParam(param);
  if (!target || !isPathContours(contours) || !vector(value)) return false;
  const point = contours.flatMap(c => c.points).find(p => p.id === target.id);
  if (!point) return false;
  point[target.field] = [...value];
  return true;
}
