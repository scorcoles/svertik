import { intersection, type MultiPolygon, type Pair } from '../polygon';
import { regionOf, toSubPath } from '../clip';
import { mapPoints, type Geometry, type Shape, type Vec2 } from '../geometry';
import { defineModifier, fromFraction } from '../modifier';
import { IDENTITY, multiply, rotateScale, translate } from '../matrix';

/** Cuts a filled drawing into radial cake-like sectors and optionally pulls them apart. */
export const radialcut = defineModifier({
  type: 'radialcut',
  label: 'Radial Cut',
  kind: 'generator',
  params: {
    count: { type: 'number', default: 8, min: 2, max: 72, step: 1, ramp: false, label: 'Count', group: 'Slices' },
    angleOffset: { type: 'angle', default: 0, label: 'Offset', group: 'Slices' },
    spin: { type: 'angle', default: 0, label: 'Spin', group: 'Slices' },
    separation: { type: 'number', default: 0, min: 0, max: 100, step: 0.5, unit: 'px', label: 'Separation' },
    center: { type: 'point', default: [0.5, 0.5], unit: 'fraction', label: 'Center' },
  },
  apply(geo, p, ctx) {
    const count = Math.max(2, Math.min(72, Math.round(p.count)));
    const b = ctx.bounds;
    if (!(b.width > 0 && b.height > 0)) return geo;

    const origin = fromFraction(b, p.center);
    const size = Math.max(b.width, b.height);
    const stepAngle = (Math.PI * 2) / count;
    let offset = (p.angleOffset * Math.PI) / 180;
    // Exact horizontal/vertical wedge edges can be coincident with source edges and
    // trigger degenerate results in polygon clipping (notably at the default offset).
    // Nudge only those axis-aligned layouts by a visually negligible amount.
    const axisAligned = Array.from({ length: count }, (_, index) => offset + index * stepAngle)
      .some((angle) => Math.abs(Math.sin(angle * 2)) < 1e-10);
    if (axisAligned) offset += (0.01 * Math.PI) / 180;
    const corners: Vec2[] = [[b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height]];
    const far = Math.max(...corners.map(([x, y]) => Math.hypot(x - origin[0], y - origin[1]))) * 4 + size;
    const pieces: { shape: Shape; sector: number; radius: number; pivot: Vec2 }[] = [];
    const untouched: Shape[] = [];
    const step = Math.max(ctx.resolution, 1e-3);
    for (const s of geo.shapes) {
      if ((s.style.fill ?? 'black') === 'none') {
        untouched.push(s);
        continue;
      }
      const region = regionOf([s], step);
      if (!region.length) continue;
      for (let index = 0; index < count; index++) {
        const start = offset + index * stepAngle;
        const wedge = radialWedge(origin, start, start + stepAngle, far);
        let sectors: MultiPolygon;
        try {
          sectors = intersection(region, wedge);
        } catch {
          return geo;
        }
        for (const sector of sectors) {
          const ring = sector[0];
          if (!ring?.length) continue;
          const cx = ring.reduce((sum, point) => sum + point[0], 0) / ring.length;
          const cy = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
          let tx = 0, ty = 0;
          if (p.separation > 0) {
            let dx = cx - origin[0], dy = cy - origin[1];
            let distance = Math.hypot(dx, dy);
            if (distance < 1e-6) {
              // A symmetric sector can have its average at the pivot; use its first edge direction.
              dx = (ring[0]![0] + ring[Math.floor(ring.length / 2)]![0]) / 2 - origin[0];
              dy = (ring[0]![1] + ring[Math.floor(ring.length / 2)]![1]) / 2 - origin[1];
              distance = Math.hypot(dx, dy);
            }
            if (distance > 1e-6) {
              tx = (dx / distance) * p.separation;
              ty = (dy / distance) * p.separation;
            }
          }
          const shifted = tx || ty
            ? sector.map((partRing) => partRing.map(([x, y]) => [x + tx, y + ty] as Pair))
            : sector;
          const subpaths = shifted.map(toSubPath).filter((path) => path !== null);
          if (subpaths.length) {
            pieces.push({
              shape: { ...s, subpaths, ...(tx || ty ? { patternTransform: multiply(translate(tx, ty), s.patternTransform ?? IDENTITY) } : {}) },
              sector: index,
              radius: Math.hypot(cx - origin[0], cy - origin[1]),
              pivot: [cx + tx, cy + ty],
            });
          }
        }
      }
    }
    // Polygon-clipping does not promise angular output order. Give pieces a stable clockwise
    // sequence so Range Even/Odd alternates around the radial cut instead of by screen position.
    pieces.sort((a, b) => a.sector - b.sector || a.radius - b.radius);
    const sliced = pieces.map(({ shape, sector, pivot }) => {
      const spin = (sector / count) * p.spin;
      if (!spin) return { ...shape, clone: sector };
      const radians = (spin * Math.PI) / 180;
      const cos = Math.cos(radians), sin = Math.sin(radians);
      const matrix = multiply(translate(pivot[0], pivot[1]), multiply(rotateScale(spin, 1), translate(-pivot[0], -pivot[1])));
      const rotated = mapPoints({ viewBox: geo.viewBox, shapes: [shape] }, ([x, y]) => [
        pivot[0] + (x - pivot[0]) * cos - (y - pivot[1]) * sin,
        pivot[1] + (x - pivot[0]) * sin + (y - pivot[1]) * cos,
      ]).shapes[0]!;
      return { ...rotated, clone: sector, patternTransform: multiply(matrix, shape.patternTransform ?? IDENTITY) };
    });
    return { viewBox: geo.viewBox, shapes: [...sliced, ...untouched.map((shape, index) => ({ ...shape, clone: sliced.length + index }))] };
  },
});

/** A sector polygon whose far arc lies well outside the drawing bounds. */
function radialWedge(origin: Vec2, start: number, end: number, radius: number): MultiPolygon {
  const degrees = ((end - start) * 180) / Math.PI;
  const segments = Math.max(2, Math.ceil(degrees / 4));
  const ring: Pair[] = [[origin[0], origin[1]]];
  for (let i = 0; i <= segments; i++) {
    const angle = start + ((end - start) * i) / segments;
    ring.push([origin[0] + Math.cos(angle) * radius, origin[1] + Math.sin(angle) * radius]);
  }
  ring.push([origin[0], origin[1]]);
  return [[ring]];
}
