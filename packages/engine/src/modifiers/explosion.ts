import { bounds, mapPoints, networkLinkShape, type Geometry, type Shape } from '../geometry';
import { defineModifier, fromFraction } from '../modifier';
import { rng } from '../random';

/**
 * Explosion: each element (a piece of Damage or Crack, a Mosaic tile, a Glitch band, a Clone copy,
 * a letter of Text…) flies away from a centre: it moves out, turns and shrinks a little, each in its own way.
 * Without tagged elements, each shape is one. `amount` from 0 to 1 advances the explosion (to animate it).
 */
export const explosion = defineModifier({
  type: 'explosion',
  label: 'Explosion',
  kind: 'effector',
  params: {
    motion: { type: 'enum', default: 'offset', options: ['offset', 'impulse'], label: 'Motion', animatable: false },
    amount: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'Amount' },
    force: { type: 'number', default: 0.5, min: 0, max: 3, step: 0.01, unit: 'fraction', label: 'Force' },
    spin: { type: 'angle', default: 90, label: 'Spin', ramp: false },
    shrink: { type: 'number', default: 0.3, min: 0, max: 1, step: 0.01, label: 'Shrink', ramp: false },
    chaos: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'Chaos', ramp: false },
    center: { type: 'point', default: [0.5, 0.5], unit: 'fraction', label: 'Center' },
    seed: { type: 'seed', default: 1 },
  },
  apply(geo, p, ctx) {
    const b = ctx.bounds;
    const size = Math.max(b.width, b.height) || 1;
    const c = fromFraction(b, p.center);
    const t = Math.max(0, Math.min(1, p.amount));
    if (t === 0) return geo;
    // Group by element.
    const movingShapes = geo.shapes.filter((shape) => !shape.networkLink);
    const tagged = movingShapes.some((s) => s.clone !== undefined);
    const groups = new Map<number, Shape[]>();
    movingShapes.forEach((s, i) => {
      const k = tagged ? (s.clone ?? -1) : i;
      groups.set(k, [...(groups.get(k) ?? []), s]);
    });
    const rand = rng(p.seed);
    const out: Shape[] = [];
    const networkMotions = new Map<string, Map<number, (point: readonly [number, number]) => [number, number]>>();
    for (const [, shapes] of groups) {
      const part: Geometry = { viewBox: geo.viewBox, shapes };
      const pb = bounds(part);
      const pc: [number, number] = [pb.x + pb.width / 2, pb.y + pb.height / 2];
      let dx = pc[0] - c[0], dy = pc[1] - c[1];
      const d = Math.hypot(dx, dy);
      // What is right at the centre flies off in a random direction.
      if (d < 1e-6) {
        const a = rand() * Math.PI * 2;
        [dx, dy] = [Math.cos(a), Math.sin(a)];
      } else [dx, dy] = [dx / d, dy / d];
      // Some deviation in direction and force, by the chaos.
      const dev = (rand() - 0.5) * p.chaos * 1.2;
      const [ux, uy] = [dx * Math.cos(dev) - dy * Math.sin(dev), dx * Math.sin(dev) + dy * Math.cos(dev)];
      const dist = p.force * size * t * (1 - p.chaos * 0.5 + rand() * p.chaos);
      const rot = ((rand() * 2 - 1) * p.spin * t * Math.PI) / 180;
      const k = 1 - p.shrink * t * (0.5 + rand() * 0.5);
      const physical = p.motion === 'impulse';
      const [cs, sn] = [Math.cos(physical ? 0 : rot) * k, Math.sin(physical ? 0 : rot) * k];
      const move = (point: readonly [number, number]): [number, number] => {
        const [x, y] = point;
        const [lx, ly] = [x - pc[0], y - pc[1]];
        return [pc[0] + lx * cs - ly * sn + (physical ? 0 : ux * dist), pc[1] + lx * sn + ly * cs + (physical ? 0 : uy * dist)];
      };
      for (const shape of shapes) for (const ref of shape.networkNodes ?? []) {
        const nodes = networkMotions.get(ref.networkId) ?? new Map();
        nodes.set(ref.node, physical ? (point: readonly [number, number]) => [point[0], point[1]] : move);
        networkMotions.set(ref.networkId, nodes);
      }
      const moved = mapPoints(part, move);
      out.push(...moved.shapes.map((shape) => ({
        ...shape,
        impulse: {
          velocity: [(shape.impulse?.velocity[0] ?? 0) + ux * dist, (shape.impulse?.velocity[1] ?? 0) + uy * dist] as [number, number],
          spin: (shape.impulse?.spin ?? 0) + rot,
        },
      })));
    }
    const links = geo.shapes.flatMap((shape) => {
      const link = shape.networkLink;
      if (!link) return [];
      const path = shape.subpaths[0];
      const nodes = networkMotions.get(link.networkId);
      const from = nodes?.get(link.from), to = nodes?.get(link.to);
      if (!path || !from || !to) return [shape];
      const end = path.segs.at(-1)?.p ?? path.start;
      const updated = networkLinkShape(shape, from(path.start), to(end));
      return updated ? [updated] : [];
    });
    return { viewBox: geo.viewBox, shapes: [...links, ...out] };
  },
});
