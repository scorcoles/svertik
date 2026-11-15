import { regionOf, ring } from '../clip';
import type { Shape } from '../geometry';
import { union, difference, intersection, type MultiPolygon, type Pair } from '../polygon';
import { defineModifier } from '../modifier';

/**
 * Mask: the object only shows where another one lets it (`source`), with SVG's native mask (`<mask>`).
 * - shape: what falls inside the mask's shape shows (`invert`: what is outside).
 * - luminance: its colours decide: white shows; black doesn't; greys, partly. A gradient from
 *   white to black gives soft fades.
 * The mask is read already placed, with its effects and animation: moving it moves the window. It is
 * usually hidden (the eye): hidden, it still works. It applies to the whole object, after its whole stack.
 */
export const mask = defineModifier({
  type: 'mask',
  label: 'Mask',
  kind: 'style',
  mask: true,
  params: {
    source: { type: 'node', default: '', label: 'Mask' },
    mode: { type: 'enum', default: 'shape', options: ['shape', 'luminance'] as const, label: 'Mode', animatable: false },
    whole: { type: 'boolean', default: false, label: 'Whole elements', showIf: { mode: ['shape'] }, animatable: false },
    invert: { type: 'boolean', default: false, label: 'Invert', showIf: { mode: ['shape'] }, animatable: false },
  },
  apply: (geo, p, ctx) => {
    if (!p.whole || p.mode !== 'shape' || !p.source) return geo;
    const target = ctx.target?.(p.source);
    if (!target?.shapes.length) return geo;
    const step = Math.max(0.05, Math.min(0.5, ctx.resolution));
    const surface = (shapes: Shape[]): MultiPolygon => {
      const parts: MultiPolygon[] = [];
      const fill = regionOf(shapes.filter(s => s.style.fill !== 'none'), step);
      if (fill.length) parts.push(fill);
      // Test the visible stroke too. Treat dashes as continuous: an element is never cut in half.
      for (const s of shapes) {
        if (!s.style.stroke || s.style.stroke === 'none') continue;
        const r = Math.max(0, Number(s.style['stroke-width'] ?? 1)) / 2;
        if (!r) continue;
        for (const sp of s.subpaths) {
          const pts = ring(sp, step);
          if (!sp.closed) pts.pop();
          for (let i = 0; i < pts.length; i++) {
            const a = pts[i]!;
            const circle: Pair[] = Array.from({ length: 24 }, (_, j) => {
              const t = j / 24 * Math.PI * 2;
              return [a[0] + r * Math.cos(t), a[1] + r * Math.sin(t)];
            });
            circle.push(circle[0]!); parts.push([[circle]]);
            const b = pts[i + 1]; if (!b) continue;
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!len) continue;
            const x = -(b[1] - a[1]) / len * r, y = (b[0] - a[0]) / len * r;
            parts.push([[[[a[0]+x,a[1]+y],[b[0]+x,b[1]+y],[b[0]-x,b[1]-y],[a[0]-x,a[1]-y],[a[0]+x,a[1]+y]]]]);
          }
        }
      }
      // Snap shared stroke vertices before boolean operations to avoid near-coincident edges.
      const snapped = parts.map(part => part.map(poly => poly.map(ring => ring.map(([x, y]): Pair => [Math.round(x * 1e7) / 1e7, Math.round(y * 1e7) / 1e7]))));
      return snapped.length ? union(snapped[0]!, ...snapped.slice(1)) : [];
    };
    const boundary = surface(target.shapes);
    if (!boundary.length) return geo;
    const cloned = geo.shapes.some(s => s.clone !== undefined);
    const groups = new Map<number, Shape[]>();
    geo.shapes.forEach((s, i) => {
      const key = cloned ? s.clone ?? -1 : i;
      const group = groups.get(key) ?? []; group.push(s); groups.set(key, group);
    });
    const keep = new Set<Shape>();
    for (const group of groups.values()) {
      const element = surface(group);
      const outside = element.length ? (p.invert ? intersection(element, boundary) : difference(element, boundary)) : [];
      if (!outside.length) for (const s of group) keep.add(s);
    }
    return { ...geo, shapes: geo.shapes.filter(s => keep.has(s)) };
  },
});
