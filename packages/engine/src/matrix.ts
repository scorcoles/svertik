// Matrices afines 2D en el formato de SVG: [a, b, c, d, e, f].
import type { Vec2 } from './geometry';

export type Mat = [number, number, number, number, number, number];

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

export const multiply = ([a1, b1, c1, d1, e1, f1]: Mat, [a2, b2, c2, d2, e2, f2]: Mat): Mat => [
  a1 * a2 + c1 * b2,
  b1 * a2 + d1 * b2,
  a1 * c2 + c1 * d2,
  b1 * c2 + d1 * d2,
  a1 * e2 + c1 * f2 + e1,
  b1 * e2 + d1 * f2 + f1,
];

export const apply = ([a, b, c, d, e, f]: Mat, [x, y]: Vec2): Vec2 => [a * x + c * y + e, b * x + d * y + f];

export function invert([a, b, c, d, e, f]: Mat): Mat {
  const det = a * d - b * c || 1e-12;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

export const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const rotateScale = (deg: number, s: number): Mat => {
  const r = (deg * Math.PI) / 180;
  return [Math.cos(r) * s, Math.sin(r) * s, -Math.sin(r) * s, Math.cos(r) * s, 0, 0];
};
