import { cleanRing, covers, inside, inRing, regionOf, ring } from '../clip';
import { bounds, type Shape } from '../geometry';
import { union, type MultiPolygon, type Pair, type Ring } from '../polygon';
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
    const surface = (shapes: Shape[], raw = false): MultiPolygon => {
      const parts: MultiPolygon[] = [];
      const filled = shapes.filter(s => s.style.fill !== 'none');
      if (raw) {
        for (const s of filled) {
          const rings = s.subpaths.filter(sp => sp.closed).map(sp => cleanRing(ring(sp, step), 1e-7)).filter(r => r.length >= 4);
          if (rings.length) parts.push([rings]);
        }
      } else {
        const fill = regionOf(filled, step, 1e-7);
        if (fill.length) parts.push(fill);
      }
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
      return raw ? snapped.flat() : snapped.length ? union(snapped[0]!, ...snapped.slice(1)) : [];
    };
    const boundary = surface(target.shapes);
    if (!boundary.length) return geo;
    const cloned = geo.shapes.some(s => s.clone !== undefined);
    const groups = new Map<number, Shape[]>();
    geo.shapes.forEach((s, i) => {
      const key = cloned ? s.clone ?? -1 : i;
      const group = groups.get(key) ?? []; group.push(s); groups.set(key, group);
    });
    const points = boundary.flat(2);
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const boundaryBox = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    const keep = new Set<Shape>();
    for (const group of groups.values()) {
      // Most copies are clearly inside or outside: only edge cases need polygon booleans.
      // Include stroke extent so this shortcut cannot admit a partially clipped stroke.
      const b = bounds({ ...geo, shapes: group });
      const pad = Math.max(0, ...group.map(s => s.style.stroke && s.style.stroke !== 'none' ? Number(s.style['stroke-width'] ?? 1) / 2 : 0));
      const box = { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 };
      const inside = covers(boundary, box);
      const apart = box.x > boundaryBox.x + boundaryBox.width || box.x + box.width < boundaryBox.x || box.y > boundaryBox.y + boundaryBox.height || box.y + box.height < boundaryBox.y;
      if (inside || (apart && pad === 0)) {
        if (p.invert ? !inside : inside) for (const s of group) keep.add(s);
        continue;
      }
      const element = surface(group, true);
      if (contained(element, boundary, p.invert)) for (const s of group) keep.add(s);
    }
    return { ...geo, shapes: geo.shapes.filter(s => keep.has(s)) };
  },
});

/** Containment without subtracting near-degenerate projected polygons. Parts use even-odd rings. */
function contained(parts: MultiPolygon, boundary: MultiPolygon, invert: boolean): boolean {
  const edges = (rings: Ring[]) => rings.flatMap(r => r.slice(0, -1).map((a, i) => [a, r[i + 1]!] as const));
  const boundaryEdges = edges(boundary.flat());
  const cross = (a: Pair, b: Pair) => a[0] * b[1] - a[1] * b[0];
  const sub = (a: Pair, b: Pair): Pair => [a[0] - b[0], a[1] - b[1]];
  const onEdge = (p: Pair, a: Pair, b: Pair) => {
    const v = sub(b, a), w = sub(p, a), length = Math.hypot(...v);
    return length === 0 ? Math.hypot(...w) <= 1e-7 : Math.abs(cross(v, w)) <= 1e-7 * length
      && w[0] * v[0] + w[1] * v[1] >= -1e-7 * length
      && w[0] * v[0] + w[1] * v[1] <= length * length + 1e-7 * length;
  };
  const allowed = (p: Pair) => boundaryEdges.some(([a, b]) => onEdge(p, a, b)) || inside(p, boundary) !== invert;
  for (const rings of parts) {
    const ownEdges = edges(rings);
    for (const [a, b] of ownEdges) {
      const v = sub(b, a), length2 = v[0] ** 2 + v[1] ** 2;
      if (!length2) { if (!allowed(a)) return false; continue; }
      const ts = [0, 1];
      for (const [c, d] of boundaryEdges) {
        const w = sub(d, c), delta = sub(c, a), den = cross(v, w);
        if (Math.abs(den) > 1e-14) {
          const t = cross(delta, w) / den, u = cross(delta, v) / den;
          if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
        } else if (Math.abs(cross(delta, v)) <= 1e-7 * Math.sqrt(length2)) {
          for (const q of [c, d]) { const t = ((q[0] - a[0]) * v[0] + (q[1] - a[1]) * v[1]) / length2; if (t > 0 && t < 1) ts.push(t); }
        }
      }
      ts.sort((x, y) => x - y);
      for (let i = 1; i < ts.length; i++) {
        const t = (ts[i - 1]! + ts[i]!) / 2;
        if (!allowed([a[0] + t * v[0], a[1] + t * v[1]])) return false;
      }
    }
    // A boundary island or hole may be entirely enclosed without crossing any element edge.
    for (const r of boundary.flat()) {
      const q = r[0]!;
      if (rings.reduce((n, ring) => n + Number(inRing(q, ring)), 0) % 2
        && !ownEdges.some(([a, b]) => onEdge(q, a, b))) return false;
    }
  }
  return true;
}
