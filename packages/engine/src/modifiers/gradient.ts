import { mixColor, parseColor, toHex } from '../color';
import type { Gradient } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * A gradient on the fill or the stroke of each shape: linear (with an angle) or radial (centre, radius and focus),
 * with an optional middle colour (`via`).
 * It is relative to each shape's box, so it follows the shape when moved or scaled.
 */
export const gradient = defineModifier({
  type: 'gradient',
  label: 'Gradient',
  kind: 'style',
  params: {
    kind: { type: 'enum', default: 'linear', options: ['linear', 'radial'] as const, animatable: false },
    from: { type: 'color', default: '#09fdd1', label: 'From' },
    to: { type: 'color', default: '#5c3cff', label: 'To' },
    fromOpacity: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'From opacity', ramp: false },
    toOpacity: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'To opacity', ramp: false },
    via: { type: 'boolean', default: false, label: 'Via', animatable: false },
    viaColor: { type: 'color', default: '#ffffff', label: 'Via color' },
    midpoint: { type: 'number', default: 0.5, min: 0.05, max: 0.95, step: 0.01, label: 'Midpoint', ramp: false },
    angle: { type: 'angle', default: 90, group: 'Linear' },
    center: { type: 'point', default: [0.5, 0.5], unit: 'fraction', group: 'Radial', label: 'Center' },
    radius: { type: 'number', default: 0.5, min: 0.05, max: 2, step: 0.01, unit: 'fraction', group: 'Radial', label: 'Radius', ramp: false },
    focus: { type: 'point', default: [0.5, 0.5], unit: 'fraction', group: 'Radial', label: 'Focus' },
    apply: { type: 'enum', default: 'fill', options: ['fill', 'stroke'] as const, label: 'Apply to', animatable: false },
  },
  apply(geo, p) {
    // From angle to end points in the unit box: the line goes through the centre and reaches the edges.
    const a = (p.angle * Math.PI) / 180;
    const [dx, dy] = [Math.cos(a), Math.sin(a)];
    const k = 0.5 / Math.max(Math.abs(dx), Math.abs(dy), 1e-9);
    const r = (n: number) => Math.round(n * 10000) / 10000;
    const g: Omit<Gradient, 'id'> = {
      kind: p.kind === 'radial' ? 'radial' : 'linear',
      stops: [
        { offset: 0, color: p.from, opacity: p.fromOpacity },
        // Middle point (where `midpoint` says): the middle colour (`via`) or, without it, the mix of both.
        { offset: r(p.midpoint), color: p.via ? p.viaColor : mid(p.from, p.to), opacity: r((p.fromOpacity + p.toOpacity) / 2) },
        { offset: 1, color: p.to, opacity: p.toOpacity },
      ],
      ...(p.kind === 'linear'
        ? { x1: r(0.5 - dx * k), y1: r(0.5 - dy * k), x2: r(0.5 + dx * k), y2: r(0.5 + dy * k) }
        : { cx: r(p.center[0]), cy: r(p.center[1]), r: r(p.radius), fx: r(p.focus[0]), fy: r(p.focus[1]) }),
    };
    // Same gradient, same id: so the SVG doesn't repeat definitions.
    const id = `svk-${hash(JSON.stringify(g))}`;
    const def: Gradient = { id, ...g };
    return {
      viewBox: geo.viewBox,
      shapes: geo.shapes.map((s) => ({
        ...s,
        style: { ...s.style, [p.apply]: `url(#${id})` },
        gradients: [...(s.gradients ?? []).filter((x) => x.id !== id), def],
      })),
    };
  },
});

function mid(a: string, b: string): string {
  const pa = parseColor(a), pb = parseColor(b);
  return pa && pb ? toHex(mixColor(pa, pb, 0.5)) : a;
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
