import { defineModifier } from '../modifier';

/** Opacity: makes the drawing transparent. With Range or Field, letters or pieces that appear or fade away. */
export const opacity = defineModifier({
  type: 'opacity',
  label: 'Opacity',
  kind: 'style',
  params: {
    // Neutral 1 (opaque): with Range/Field, weight 0 = as it was; weight 1 = this opacity.
    opacity: { type: 'number', default: 0, min: 0, max: 1, step: 0.01, neutral: 1, label: 'Opacity' },
  },
  apply(geo, p) {
    const k = Math.max(0, Math.min(1, p.opacity));
    if (k >= 1) return geo;
    return {
      viewBox: geo.viewBox,
      shapes: geo.shapes.map((s) => ({ ...s, style: { ...s.style, opacity: String(Number(s.style.opacity ?? 1) * k) } })),
    };
  },
});
