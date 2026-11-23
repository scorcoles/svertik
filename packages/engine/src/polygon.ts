// polygon-clipping, the same in the browser (ES module) and in Node (CommonJS, all inside `default`).
import * as pc from 'polygon-clipping';

type PC = typeof import('polygon-clipping');
const api: PC = (pc as unknown as { union?: unknown }).union ? (pc as unknown as PC) : (pc as unknown as { default: PC }).default;

/** Coordinates rounded to a grid of 1/q px (any nesting of rings and polygons). */
function snap<T>(geom: T, q: number): T {
  if (!Array.isArray(geom)) return geom;
  if (typeof geom[0] === 'number') return [Math.round(geom[0] * q) / q, Math.round((geom[1] as number) * q) / q] as T;
  return geom.map((item) => snap(item, q)) as T;
}

/**
 * polygon-clipping can recurse without end (a RangeError) or throw on nearly coincident edges, e.g. letters
 * squeezed by Perspective. Then it is retried with the coordinates snapped to coarser grids: 1/10000 px is
 * usually enough and never visible.
 */
const GRIDS = [1e4, 1e3, 1e2];
function robust<F extends (...geoms: never[]) => unknown>(op: F): F {
  return ((...geoms: Parameters<F>) => {
    try {
      return op(...geoms);
    } catch (error) {
      for (const q of GRIDS) {
        try {
          return op(...(geoms.map((g) => snap(g, q)) as Parameters<F>));
        } catch { /* next, coarser grid */ }
      }
      throw error;
    }
  }) as F;
}

export const union = robust(api.union);
export const intersection = robust(api.intersection);
export const difference = robust(api.difference);
export const xor = robust(api.xor);
export type { Geom, MultiPolygon, Pair, Polygon, Ring } from 'polygon-clipping';
