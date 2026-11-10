import { mixColor, parseColor, toHex } from '../color';
import type { Gradient } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * Degradado en el relleno o en el trazo de cada forma: lineal (con ángulo) o radial.
 * Va relativo a la caja de cada forma, así que la sigue al moverla o escalarla.
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
    angle: { type: 'angle', default: 90 },
    midpoint: { type: 'number', default: 0.5, min: 0.05, max: 0.95, step: 0.01, label: 'Midpoint', ramp: false },
    apply: { type: 'enum', default: 'fill', options: ['fill', 'stroke'] as const, label: 'Apply to', animatable: false },
  },
  apply(geo, p) {
    // De ángulo a extremos en la caja unidad: la línea pasa por el centro y llega a los bordes.
    const a = (p.angle * Math.PI) / 180;
    const [dx, dy] = [Math.cos(a), Math.sin(a)];
    const k = 0.5 / Math.max(Math.abs(dx), Math.abs(dy), 1e-9);
    const r = (n: number) => Math.round(n * 10000) / 10000;
    const g: Omit<Gradient, 'id'> = {
      kind: p.kind === 'radial' ? 'radial' : 'linear',
      stops: [
        { offset: 0, color: p.from, opacity: p.fromOpacity },
        // Punto medio: el color a medio camino, donde diga `midpoint`.
        { offset: r(p.midpoint), color: mid(p.from, p.to), opacity: r((p.fromOpacity + p.toOpacity) / 2) },
        { offset: 1, color: p.to, opacity: p.toOpacity },
      ],
      ...(p.kind === 'linear' ? { x1: r(0.5 - dx * k), y1: r(0.5 - dy * k), x2: r(0.5 + dx * k), y2: r(0.5 + dy * k) } : {}),
    };
    // Mismo degradado, mismo id: así el SVG no repite definiciones.
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
