import { mixColor, parseColor, toHex } from '../color';
import type { Style } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * Relleno y trazo: superpone un color al relleno (cantidad 1 = lo sustituye) y añade o cambia el trazo.
 * Las formas sin relleno (líneas) se quedan sin él salvo que se pida «Fill empty».
 */
export const paint = defineModifier({
  type: 'paint',
  label: 'Paint',
  kind: 'style',
  params: {
    fill: { type: 'boolean', default: true, label: 'Fill', group: 'Fill', animatable: false },
    fillColor: { type: 'color', default: '#09fdd1', label: 'Color', group: 'Fill' },
    fillAmount: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'Amount', group: 'Fill' },
    fillOpacity: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'Opacity', group: 'Fill', ramp: false, random: [0.4, 1] },
    fillEmpty: { type: 'boolean', default: false, label: 'Fill empty', group: 'Fill', animatable: false },
    stroke: { type: 'boolean', default: false, label: 'Stroke', group: 'Stroke', animatable: false },
    strokeColor: { type: 'color', default: '#000000', label: 'Color', group: 'Stroke' },
    strokeWidth: { type: 'number', default: 1, min: 0, max: 20, step: 0.1, unit: 'px', label: 'Width', group: 'Stroke', random: [0.5, 6] },
    strokeOpacity: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'Opacity', group: 'Stroke', ramp: false, random: [0.4, 1] },
  },
  apply(geo, p) {
    const overlay = parseColor(p.fillColor);
    const shapes = geo.shapes.map((shape) => {
      const style: Style = { ...shape.style };
      if (p.fill && overlay) {
        const current = style.fill;
        const empty = current === 'none' || current === 'transparent';
        if (!empty || p.fillEmpty) {
          // Sin relleno declarado, el SVG pinta en negro; «none» se trata como transparente.
          const base = parseColor(empty ? undefined : (current ?? '#000000'));
          style.fill = toHex(base ? mixColor(base, overlay, Math.max(0, Math.min(1, p.fillAmount))) : overlay);
          if (p.fillOpacity < 1) style['fill-opacity'] = String(p.fillOpacity);
        }
      }
      if (p.stroke) {
        style.stroke = p.strokeColor;
        style['stroke-width'] = String(p.strokeWidth);
        if (p.strokeOpacity < 1) style['stroke-opacity'] = String(p.strokeOpacity);
        style['stroke-linejoin'] ??= 'round';
      }
      return { ...shape, style };
    });
    return { viewBox: geo.viewBox, shapes };
  },
});
