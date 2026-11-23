import { parseColor, toHex } from '../color';
import { bounds, mapPoints, type Gradient, type Geometry, type Shape } from '../geometry';
import { defineModifier } from '../modifier';

/** Softens a filled shape with a native radial gradient, without a raster SVG filter. */
export const feather = defineModifier({
  type: 'feather',
  label: 'Feather',
  kind: 'style',
  params: {
    softness: { type: 'number', default: 0.2, min: 0, max: 0.6, step: 0.01, unit: 'fraction', label: 'Softness' },
  },
  apply(geo, p) {
    if (p.softness <= 0) return geo;
    const softness = Math.min(0.6, Math.max(0, p.softness));
    const core = 1 - softness;
    const fades = Array.from({ length: 17 }, (_, i) => {
      const t = i / 16;
      // Dense samples of a Gaussian-like falloff keep the native gradient free of visible bands.
      const opacity = i === 16 ? 0 : Math.exp(-4 * t * t);
      return { offset: core + softness * t, opacity };
    });
    const shapes = geo.shapes.map((shape) => {
      const color = parseColor(shape.style.fill);
      if (!color || color[3] <= 0) return shape;
      const solid = toHex([color[0], color[1], color[2], 1]);
      const id = `svk-feather-${hash(`${solid}:${color[3]}:${softness}`)}`;
      const gradient: Gradient = {
        id,
        kind: 'radial',
        cx: 0.5,
        cy: 0.5,
        r: 0.5,
        fx: 0.5,
        fy: 0.5,
        stops: fades.map(({ offset, opacity }) => ({ offset, color: solid, opacity: color[3] * opacity })),
      };
      const one: Geometry = { viewBox: geo.viewBox, shapes: [shape] };
      const box = bounds(one);
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      const scale = 1 / core;
      const expanded = mapPoints(one, ([x, y]) => [cx + (x - cx) * scale, cy + (y - cy) * scale]);
      const result: Shape = expanded.shapes[0]!;
      return {
        ...result,
        style: { ...shape.style, fill: `url(#${id})` },
        gradients: [...(shape.gradients ?? []).filter((g) => g.id !== id), gradient],
      };
    });
    return { ...geo, shapes };
  },
});

function hash(source: string): string {
  let h = 2166136261;
  for (let i = 0; i < source.length; i++) h = Math.imul(h ^ source.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
