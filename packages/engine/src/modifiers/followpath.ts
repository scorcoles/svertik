import { mapPoints, type Vec2 } from '../geometry';
import { defineModifier, deg, fromFraction } from '../modifier';
import { pointAt, polylines } from '../paths';

/**
 * Moves the whole object to a point on another object's path (its longest one), without bending it:
 * `position` is the fraction of the way (0, the start; 1, the end; on a closed path it loops).
 * `anchor` is the point of the object that sits on the path. With `orient`, it turns with the path's direction.
 * `offset` moves it to one side of the path; `angle`, an extra turn.
 */
export const followpath = defineModifier({
  type: 'followpath',
  label: 'Follow Path',
  kind: 'deformer',
  family: 'utils',
  params: {
    target: { type: 'node', default: '', label: 'Path' },
    position: { type: 'number', default: 0, min: 0, max: 1, step: 0.001, label: 'Position', ramp: true },
    orient: { type: 'boolean', default: true, label: 'Orient' },
    angle: { type: 'angle', default: 0, label: 'Angle' },
    offset: { type: 'number', default: 0, min: -500, max: 500, step: 0.5, unit: 'px', label: 'Offset', random: [-30, 30] },
    anchor: { type: 'point', default: [0.5, 0.5], unit: 'fraction', label: 'Anchor' },
  },
  apply(geo, p, ctx) {
    const target = p.target ? ctx.target?.(p.target) : null;
    if (!target) return geo;
    const line = polylines(target).sort((a, b) => b.length - a.length)[0];
    if (!line) return geo;
    const L = line.length;
    // On an open path, end to end (without extending it); on a closed one, laps.
    const s = line.closed ? p.position * L : Math.max(0, Math.min(1, p.position)) * L;
    const { p: q, t } = pointAt(line, s);
    const a = fromFraction(ctx.bounds, p.anchor);
    const turn = (p.orient ? Math.atan2(t[1], t[0]) : 0) + deg(p.angle);
    const cos = Math.cos(turn), sin = Math.sin(turn);
    // To one side: the path's normal (the tangent turned 90°).
    const at: Vec2 = [q[0] - t[1] * p.offset, q[1] + t[0] * p.offset];
    return mapPoints(geo, ([x, y]) => {
      const dx = x - a[0], dy = y - a[1];
      return [at[0] + dx * cos - dy * sin, at[1] + dx * sin + dy * cos];
    });
  },
});
