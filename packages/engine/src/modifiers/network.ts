import { bounds, flatten, insidePolygons, type Geometry, type Shape, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';

interface Node {
  geometry: Geometry;
  center: Vec2;
  box: ReturnType<typeof bounds>;
  inside: (point: Vec2) => boolean;
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
    color: { type: 'color', default: '#09fdd1', solid: true, label: 'Link color' },
    width: { type: 'number', default: 1.5, min: 0.1, max: 24, step: 0.1, unit: 'px', label: 'Link width', ramp: false },
  },
  apply(geo, p): Geometry {
    if (geo.shapes.length < 2) return geo;
    const tagged = geo.shapes.some((shape) => shape.clone !== undefined);
    const groups = new Map<string, Shape[]>();
    for (const [index, shape] of geo.shapes.entries()) {
      const key = tagged ? `clone:${shape.clone ?? `uncloned:${index}`}` : `shape:${index}`;
      const group = groups.get(key) ?? [];
      group.push(shape);
      groups.set(key, group);
    }
    const nodes: Node[] = [...groups.values()].map((shapes) => {
      const geometry = { viewBox: geo.viewBox, shapes };
      const box = bounds(geometry);
      const center: Vec2 = [box.x + box.width / 2, box.y + box.height / 2];
      const polygons = shapes.map((shape) => shape.subpaths.filter((path) => path.closed).map((path) => flatten(path, 12))).filter((rings) => rings.length);
      const inside = polygons.length
        ? (point: Vec2) => polygons.some((rings) => insidePolygons(rings, point))
        : (point: Vec2) => point[0] >= box.x && point[0] <= box.x + box.width && point[1] >= box.y && point[1] <= box.y + box.height;
      return { geometry, center, box, inside };
    }).filter((node) => Number.isFinite(node.center[0]) && Number.isFinite(node.center[1]));
    if (nodes.length < 2) return geo;

    const maxDistance = Math.max(0, p.maxDistance);
    const candidates = nodes.map(() => [] as { index: number; distance: number }[]);
    const addPair = (i: number, j: number) => {
      const a = nodes[i]!, b = nodes[j]!;
      const distance = Math.hypot(b.center[0] - a.center[0], b.center[1] - a.center[1]);
      if (distance <= 1e-6 || (maxDistance > 0 && distance > maxDistance)) return;
      candidates[i]!.push({ index: j, distance });
      candidates[j]!.push({ index: i, distance });
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
      near.sort((a, b) => a.distance - b.distance || a.index - b.index);
      for (const candidate of near.slice(0, Math.floor(p.neighbors))) {
        const a = Math.min(i, candidate.index), b = Math.max(i, candidate.index);
        edges.add(`${a}:${b}`);
      }
    });

    const clipFromCenter = (node: Node, toward: Vec2, distance: number) => {
      if (!node.inside(node.center)) return 0;
      const steps = 32;
      let insideT = 0;
      for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        const point: Vec2 = [node.center[0] + toward[0] * distance * t, node.center[1] + toward[1] * distance * t];
        if (node.inside(point)) { insideT = t; continue; }
        let lo = insideT, hi = t;
        for (let k = 0; k < 18; k++) {
          const mid = (lo + hi) / 2;
          const sample: Vec2 = [node.center[0] + toward[0] * distance * mid, node.center[1] + toward[1] * distance * mid];
          if (node.inside(sample)) lo = mid;
          else hi = mid;
        }
        return distance * ((lo + hi) / 2);
      }
      return 0;
    };

    const lineShapes: Shape[] = [];
    let nextClone = Math.max(-1, ...geo.shapes.map((shape) => shape.clone ?? -1)) + 1;
    for (const edge of edges) {
      const [i, j] = edge.split(':').map(Number) as [number, number];
      const a = nodes[i]!, b = nodes[j]!;
      const dx = b.center[0] - a.center[0], dy = b.center[1] - a.center[1];
      const distance = Math.hypot(dx, dy), direction: Vec2 = [dx / distance, dy / distance];
      const startOffset = clipFromCenter(a, direction, distance) + p.gap;
      const endOffset = clipFromCenter(b, [-direction[0], -direction[1]], distance) + p.gap;
      if (startOffset + endOffset >= distance) continue;
      const start: Vec2 = [a.center[0] + direction[0] * startOffset, a.center[1] + direction[1] * startOffset];
      const end: Vec2 = [b.center[0] - direction[0] * endOffset, b.center[1] - direction[1] * endOffset];
      lineShapes.push({
        style: { fill: 'none', stroke: p.color, 'stroke-width': String(p.width), 'stroke-linecap': 'round' },
        subpaths: [{ start, segs: [{ c1: [start[0] + (end[0] - start[0]) / 3, start[1] + (end[1] - start[1]) / 3], c2: [start[0] + (end[0] - start[0]) * 2 / 3, start[1] + (end[1] - start[1]) * 2 / 3], p: end }], closed: false }],
        ...(tagged ? { clone: nextClone++ } : {}),
      });
    }
    // Links render behind their source nodes, which remain untouched.
    return { viewBox: geo.viewBox, shapes: [...lineShapes, ...geo.shapes] };
  },
});
