import { defineModifier } from '../modifier';

/** Opacidad: hace transparente el dibujo. Con Range o Field, letras o trozos que aparecen o se desvanecen. */
export const opacity = defineModifier({
  type: 'opacity',
  label: 'Opacity',
  kind: 'style',
  params: {
    // Neutro 1 (opaco): con Range/Field, peso 0 = como estaba; peso 1 = esta opacidad.
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
