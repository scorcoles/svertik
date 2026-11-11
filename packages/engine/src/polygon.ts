// polygon-clipping, the same in the browser (ES module) and in Node (CommonJS, all inside `default`).
import * as pc from 'polygon-clipping';

type PC = typeof import('polygon-clipping');
const api: PC = (pc as unknown as { union?: unknown }).union ? (pc as unknown as PC) : (pc as unknown as { default: PC }).default;

export const { union, intersection, difference, xor } = api;
export type { Geom, MultiPolygon, Pair, Polygon, Ring } from 'polygon-clipping';
