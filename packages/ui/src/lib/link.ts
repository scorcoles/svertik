/**
 * Dos valores enlazados: al cambiar uno, el otro cambia en la misma proporción.
 * Si el que cambia valía 0 (no hay proporción), el otro toma el mismo valor.
 */
export function proportional([a, b]: readonly [number, number], i: 0 | 1, v: number): [number, number] {
  const old = i === 0 ? a : b;
  const other = i === 0 ? b : a;
  const k = old === 0 ? null : v / old;
  const o = k === null ? v : Math.round(other * k * 1000) / 1000;
  return i === 0 ? [v, o] : [o, v];
}
