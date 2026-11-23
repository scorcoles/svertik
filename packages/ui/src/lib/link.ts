/**
 * Two linked values: when one changes, the other changes in the same proportion.
 * If the changing one was 0 (no proportion), the other takes the same value.
 */
export function proportional([a, b]: readonly [number, number], i: 0 | 1, v: number): [number, number] {
  const old = i === 0 ? a : b;
  const other = i === 0 ? b : a;
  const k = old === 0 ? null : v / old;
  const o = k === null ? v : Math.round(other * k * 1000) / 1000;
  return i === 0 ? [v, o] : [o, v];
}
