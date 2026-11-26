import { bounds, flatten, insidePolygons, type Geometry, type Shape, type Style, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';

interface Node {
  geometry: Geometry;
  center: Vec2;
  box: ReturnType<typeof bounds>;
  inside: (point: Vec2) => boolean;
  /** Its outline as segments (the closed contours, or the box), for where a link leaves it. */
  edges: [Vec2, Vec2][];
}

/** Draws deduplicated nearest-neighbour links between existing geometry elements. */
export const network = defineModifier({
  type: 'network',
  label: 'Network',
  kind: 'generator',
  family: 'utils',
  params: {
    neighbors: { type: 'number', default: 2, min: 1, max: 8, step: 1, label: 'Neighbors', ramp: false },
    maxDistance: { type: 'number', default: 180, min: 0, max: 1200, step: 5, unit: 'px', label: 'Max distance', ramp: false },
    gap: { type: 'number', default: 2, min: 0, max: 100, step: 0.5, unit: 'px', label: 'Edge gap', ramp: false },
    elasticity: { type: 'number', default: 0.35, min: 0, max: 1, step: 0.01, label: 'Elasticity', ramp: false },
    resistance: { type: 'number', default: 3, min: 1, max: 8, step: 0.1, label: 'Resistance', ramp: false },
    width: { type: 'number', default: 1.5, min: 0.1, max: 24, step: 0.1, unit: 'px', label: 'Link width', ramp: false },
  },
  apply(geo, p, ctx): Geometry {
    const sourceShapes = geo.shapes.filter((shape) => !shape.networkLink);
    if (sourceShapes.length < 2) return geo;
    const networkId = ctx.id ?? 'network';
    const tagged = sourceShapes.some((shape) => shape.clone !== undefined);
    const groups = new Map<string, Shape[]>();
    for (const [index, shape] of sourceShapes.entries()) {
      const key = tagged ? `clone:${shape.clone ?? `uncloned:${index}`}` : `shape:${index}`;
      const group = groups.get(key) ?? [];
      group.push(shape);
      groups.set(key, group);
    }
    const nodeForShape = new Map<Shape, number>();
    const nodes: Node[] = [];
    for (const shapes of groups.values()) {
      const geometry = { viewBox: geo.viewBox, shapes };
      const box = bounds(geometry);
      const center: Vec2 = [box.x + box.width / 2, box.y + box.height / 2];
      const polygons = shapes.map((shape) => shape.subpaths.filter((path) => path.closed).map((path) => flatten(path, 12))).filter((rings) => rings.length);
      const inside = polygons.length
        ? (point: Vec2) => polygons.some((rings) => insidePolygons(rings, point))
        : (point: Vec2) => point[0] >= box.x && point[0] <= box.x + box.width && point[1] >= box.y && point[1] <= box.y + box.height;
      if (Number.isFinite(center[0]) && Number.isFinite(center[1])) {
        const node = nodes.length;
        for (const shape of shapes) nodeForShape.set(shape, node);
        const corners: Vec2[] = [[box.x, box.y], [box.x + box.width, box.y], [box.x + box.width, box.y + box.height], [box.x, box.y + box.height]];
        const rings = polygons.length ? polygons.flat() : [corners];
        const edges = rings.flatMap((ring) => ring.map((point, k) => [point, ring[(k + 1) % ring.length]!] as [Vec2, Vec2]));
        nodes.push({ geometry, center, box, inside, edges });
      }
    }
    if (nodes.length < 2) return geo;

    const maxDistance = Math.max(0, p.maxDistance);
    // Each node keeps only its `neighbors` nearest, in order (distance, then index), instead of sorting them all.
    const keep = Math.max(0, Math.floor(p.neighbors));
    const candidates = nodes.map(() => [] as { index: number; distance: number }[]);
    const offer = (near: { index: number; distance: number }[], index: number, distance: number) => {
      const last = near[near.length - 1];
      if (near.length >= keep && last && (distance > last.distance || (distance === last.distance && index > last.index))) return;
      let at = near.length;
      while (at > 0 && (near[at - 1]!.distance > distance || (near[at - 1]!.distance === distance && near[at - 1]!.index > index))) at--;
      near.splice(at, 0, { index, distance });
      if (near.length > keep) near.pop();
    };
    const addPair = (i: number, j: number) => {
      const a = nodes[i]!, b = nodes[j]!;
      const distance = Math.hypot(b.center[0] - a.center[0], b.center[1] - a.center[1]);
      if (distance <= 1e-6 || (maxDistance > 0 && distance > maxDistance)) return;
      offer(candidates[i]!, j, distance);
      offer(candidates[j]!, i, distance);
    };

    // A finite max distance keeps large cloned grids local instead of comparing every pair.
    if (maxDistance > 0) {
      const cellSize = maxDistance;
      const cell = (point: Vec2) => [Math.floor(point[0] / cellSize), Math.floor(point[1] / cellSize)] as const;
      const buckets = new Map<string, number[]>();
      nodes.forEach((node, index) => {
        const [x, y] = cell(node.center), key = `${x},${y}`;
        const bucket = buckets.get(key) ?? [];
        bucket.push(index);
        buckets.set(key, bucket);
      });
      nodes.forEach((node, i) => {
        const [x, y] = cell(node.center);
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          for (const j of buckets.get(`${x + ox},${y + oy}`) ?? []) if (j > i) addPair(i, j);
        }
      });
    } else {
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) addPair(i, j);
    }

    const edges = new Set<string>();
    candidates.forEach((near, i) => {
      for (const candidate of near) {
        const a = Math.min(i, candidate.index), b = Math.max(i, candidate.index);
        edges.add(`${a}:${b}`);
      }
    });

    // Where a link leaves its node: the first crossing of the ray from the centre with the node's outline
    // (exact, instead of sampling the ray); 0 when the centre is outside it or the outline is not crossed.
    const centred = nodes.map((node) => node.inside(node.center));
    const clipFromCenter = (index: number, toward: Vec2, distance: number) => {
      const node = nodes[index]!;
      if (!centred[index]) return 0;
      const [cx, cy] = node.center, [dx, dy] = toward;
      let nearest = Infinity;
      for (const [a, b] of node.edges) {
        const ex = b[0] - a[0], ey = b[1] - a[1];
        const det = dx * ey - dy * ex;
        if (Math.abs(det) < 1e-12) continue;
        const ax = a[0] - cx, ay = a[1] - cy;
        const t = (ax * ey - ay * ex) / det;
        const u = (ax * dy - ay * dx) / det;
        if (t > 1e-9 && u >= 0 && u <= 1 && t < nearest) nearest = t;
      }
      return nearest <= distance ? nearest : 0;
    };

    const lineShapes: Shape[] = [];
    let nextClone = Math.max(-1, ...geo.shapes.map((shape) => shape.clone ?? -1)) + 1;
    for (const edge of edges) {
      const [i, j] = edge.split(':').map(Number) as [number, number];
      const a = nodes[i]!, b = nodes[j]!;
      const dx = b.center[0] - a.center[0], dy = b.center[1] - a.center[1];
      const distance = Math.hypot(dx, dy), direction: Vec2 = [dx / distance, dy / distance];
      const startOffset = clipFromCenter(i, direction, distance) + p.gap;
      const endOffset = clipFromCenter(j, [-direction[0], -direction[1]], distance) + p.gap;
      if (startOffset + endOffset >= distance) continue;
      const start: Vec2 = [a.center[0] + direction[0] * startOffset, a.center[1] + direction[1] * startOffset];
      const end: Vec2 = [b.center[0] - direction[0] * endOffset, b.center[1] - direction[1] * endOffset];
      const source = a.geometry.shapes.find((shape) => shape.style.stroke && shape.style.stroke !== 'none')
        ?? a.geometry.shapes.find((shape) => shape.style.fill && shape.style.fill !== 'none')
        ?? b.geometry.shapes[0];
      const stroke = source?.style.stroke && source.style.stroke !== 'none' ? source.style.stroke
        : source?.style.fill && source.style.fill !== 'none' ? source.style.fill : '#333333';
      const style: Style = { fill: 'none', stroke, 'stroke-width': String(p.width), 'stroke-linecap': 'round' };
      if (source?.style.opacity) style.opacity = source.style.opacity;
      if (source?.style['mix-blend-mode']) style['mix-blend-mode'] = source.style['mix-blend-mode'];
      lineShapes.push({
        style,
        ...(source?.gradients ? { gradients: source.gradients } : {}),
        subpaths: [{ start, segs: [{ c1: [start[0] + (end[0] - start[0]) / 3, start[1] + (end[1] - start[1]) / 3], c2: [start[0] + (end[0] - start[0]) * 2 / 3, start[1] + (end[1] - start[1]) * 2 / 3], p: end }], closed: false }],
        networkLink: { networkId, from: i, to: j, restLength: Math.hypot(end[0] - start[0], end[1] - start[1]), elasticity: p.elasticity, resistance: p.resistance },
        ...(tagged ? { clone: nextClone++ } : {}),
      });
    }
    // Store graph identities on the nodes so Gravity can transform each link end with its body.
    const markedSources = new Map<Shape, Shape>();
    for (const shape of sourceShapes) {
      const node = nodeForShape.get(shape);
      if (node === undefined) continue;
      const refs = (shape.networkNodes ?? []).filter((ref) => ref.networkId !== networkId);
      markedSources.set(shape, { ...shape, networkNodes: [...refs, { networkId, node }] });
    }
    // Links render behind their source nodes; earlier Network links stay excluded from node selection.
    return { viewBox: geo.viewBox, shapes: [...lineShapes, ...geo.shapes.map((shape) => markedSources.get(shape) ?? shape)] };
  },
});
