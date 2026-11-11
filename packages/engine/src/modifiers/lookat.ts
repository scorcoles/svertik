import { centroid, mapPoints } from '../geometry';
import { defineModifier, deg, fromFraction } from '../modifier';

/**
 * Gira el objeto para que mire hacia otro (hacia su centro), sin moverlo: gira sobre `pivot`.
 * `facing`: qué lado del objeto es su frente (0, la derecha; -90, arriba; 90, abajo; 180, la izquierda).
 * `amount`: cuánto gira hacia él (0, nada; 1, del todo). Si el otro se mueve, lo sigue con la mirada.
 */
export const lookat = defineModifier({
  type: 'lookat',
  label: 'Look At',
  kind: 'deformer',
  family: 'utils',
  params: {
    target: { type: 'node', default: '', label: 'Target' },
    facing: { type: 'angle', default: 0, label: 'Facing' },
    amount: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'Amount', neutral: 0 },
    pivot: { type: 'point', default: [0.5, 0.5], unit: 'fraction', label: 'Pivot' },
  },
  apply(geo, p, ctx) {
    const target = p.target ? ctx.target?.(p.target) : null;
    const c = target ? centroid(target) : null;
    if (!c) return geo;
    const o = fromFraction(ctx.bounds, p.pivot);
    const dx = c[0] - o[0], dy = c[1] - o[1];
    if (Math.hypot(dx, dy) < 1e-9) return geo;
    // El giro más corto desde el frente hasta la dirección del otro.
    let turn = Math.atan2(dy, dx) - deg(p.facing);
    turn = Math.atan2(Math.sin(turn), Math.cos(turn)) * p.amount;
    if (Math.abs(turn) < 1e-12) return geo;
    const cos = Math.cos(turn), sin = Math.sin(turn);
    return mapPoints(geo, ([x, y]) => {
      const rx = x - o[0], ry = y - o[1];
      return [o[0] + rx * cos - ry * sin, o[1] + rx * sin + ry * cos];
    });
  },
});
