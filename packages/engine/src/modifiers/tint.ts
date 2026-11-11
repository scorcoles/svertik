import { mixColor, parseColor, toHex } from '../color';
import type { Style } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * Pushes the colour towards a target colour. Inside Step the amount grows copy by copy:
 * with 0.1, the 1st gets 10 % closer, the 2nd 20 %… (white lightens, black darkens).
 */
export const tint = defineModifier({
  type: 'tint',
  label: 'Tint',
  kind: 'style',
  params: {
    color: { type: 'color', default: '#ffffff' },
    amount: { type: 'number', default: 0.3, min: 0, max: 1, step: 0.01 },
    target: { type: 'enum', default: 'fill', options: ['fill', 'stroke', 'both'] as const, animatable: false },
  },
  apply(geo, p) {
    const to = parseColor(p.color);
    if (!to || p.amount <= 0) return geo;
    const t = Math.min(1, p.amount);
    const props = p.target === 'both' ? ['fill', 'stroke'] : [p.target];
    const shapes = geo.shapes.map((shape) => {
      const style: Style = { ...shape.style };
      for (const prop of props) {
        const current = style[prop] ?? (prop === 'fill' ? '#000000' : undefined);
        const c = parseColor(current);
        if (c) style[prop] = toHex(mixColor(c, [to[0], to[1], to[2], c[3]], t));
      }
      return { ...shape, style };
    });
    return { viewBox: geo.viewBox, shapes };
  },
});
