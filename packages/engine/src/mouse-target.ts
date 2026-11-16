import type { DocumentResult } from './document';
import { bounds, flatten, type Bounds, type Vec2 } from './geometry';

interface Area { box: Bounds; shapes: { rings: Vec2[][]; evenodd: boolean }[] }
const cache = new WeakMap<DocumentResult, Map<string, Area | null>>();

/** Closed target geometry, including hidden nodes. Paint/opacity/filter extents do not define the area. */
export function insideMouseTarget(doc: DocumentResult | null | undefined, target: string, point: Vec2): boolean {
  if (!doc) return false;
  let targets = cache.get(doc);
  if (!targets) { targets = new Map(); cache.set(doc, targets); }
  if (!targets.has(target)) {
    const geo = doc.geometryOf(target);
    targets.set(target, geo ? {
      box: bounds(geo),
      shapes: geo.shapes.map(s => ({ rings: s.subpaths.filter(p => p.closed).map(p => flatten(p, 16)), evenodd: s.style['fill-rule'] === 'evenodd' })),
    } : null);
  }
  const area = targets.get(target);
  if (!area) return false;
  const [x, y] = point, b = area.box;
  if (x < b.x || y < b.y || x > b.x + b.width || y > b.y + b.height) return false;
  return area.shapes.some(({ rings, evenodd }) => {
    let winding = 0, odd = false;
    for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[j]!, [bx, by] = ring[i]!;
      const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
      if (length2 > 0) {
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length2));
        if ((x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= 1e-12) return true;
      }
      if ((ay > y) !== (by > y) && x < ax + (y - ay) * dx / dy) {
        odd = !odd;
        winding += by > ay ? 1 : -1;
      }
    }
    return evenodd ? odd : winding !== 0;
  });
}
