import { bounds, mapPoints, type Geometry, type Shape } from '../geometry';
import { defineModifier, deg } from '../modifier';

/**
 * Efector incremental (como el Step Effector de C4D): cada elemento recibe el cambio
 * multiplicado por su posición. Con 10° de giro, el primero gira 10°, el segundo 20°…
 * Los elementos son las copias de Clone; sin Clone, cada forma del SVG.
 * Cada elemento gira y escala sobre su propio centro.
 */
export const step = defineModifier({
  type: 'step',
  label: 'Step',
  kind: 'effector',
  params: {
    rotation: { type: 'angle', default: 10, label: 'Rotate' },
    scale: { type: 'number', default: 0, min: -1, max: 1, step: 0.01, label: 'Scale' },
    offset: { type: 'point', default: [0, 0], unit: 'fraction', label: 'Offset' },
    reverse: { type: 'boolean', default: false, label: 'Reverse', animatable: false },
    amount: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'Strength', group: 'Mix' },
  },
  apply(geo, p, ctx) {
    // Elementos: por número de copia si los hay; si no, una forma = un elemento.
    const tagged = geo.shapes.some((s) => s.clone !== undefined);
    const keyOf = (s: Shape, i: number) => (tagged ? (s.clone ?? -1) : i);
    const keys = [...new Set(geo.shapes.map(keyOf))].filter((k) => k >= 0).sort((a, b) => a - b);
    const n = keys.length;
    if (n === 0) return geo;
    const order = new Map(keys.map((k, i) => [k, p.reverse ? n - i : i + 1]));

    // Centro de cada elemento.
    const centers = new Map<number, [number, number]>();
    for (const k of keys) {
      const b = bounds({ viewBox: geo.viewBox, shapes: geo.shapes.filter((s, i) => keyOf(s, i) === k) });
      centers.set(k, [b.x + b.width / 2, b.y + b.height / 2]);
    }

    const W = ctx.bounds.width;
    const H = ctx.bounds.height;
    const shapes = geo.shapes.map((s, i) => {
      const key = keyOf(s, i);
      const k = order.get(key);
      if (k === undefined) return s;
      const f = k * p.amount;
      const a = deg(p.rotation) * f;
      const sc = Math.max(0, 1 + p.scale * f);
      const c = Math.cos(a) * sc;
      const sn = Math.sin(a) * sc;
      const [cx, cy] = centers.get(key)!;
      const dx = p.offset[0] * W * f;
      const dy = p.offset[1] * H * f;
      const one: Geometry = { viewBox: geo.viewBox, shapes: [s] };
      return mapPoints(one, ([x, y]) => {
        const ux = x - cx;
        const uy = y - cy;
        return [cx + ux * c - uy * sn + dx, cy + ux * sn + uy * c + dy];
      }).shapes[0]!;
    });
    return { viewBox: geo.viewBox, shapes };
  },
});
