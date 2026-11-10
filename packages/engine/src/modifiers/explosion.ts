import { bounds, mapPoints, type Geometry, type Shape } from '../geometry';
import { defineModifier, fromFraction } from '../modifier';
import { rng } from '../random';

/**
 * Explosión: cada elemento (trozo de Damage o Crack, tesela de Mosaic, franja de Glitch, copia de Clone,
 * letra de Text…) sale despedido desde un centro: se aleja, gira y encoge un poco, cada uno a su manera.
 * Sin elementos marcados, cada forma es uno. `amount` de 0 a 1 hace avanzar la explosión (para animarla).
 */
export const explosion = defineModifier({
  type: 'explosion',
  label: 'Explosion',
  kind: 'effector',
  params: {
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
    // Agrupar por elemento.
    const tagged = geo.shapes.some((s) => s.clone !== undefined);
    const groups = new Map<number, Shape[]>();
    geo.shapes.forEach((s, i) => {
      const k = tagged ? (s.clone ?? -1) : i;
      groups.set(k, [...(groups.get(k) ?? []), s]);
    });
    const rand = rng(p.seed);
    const out: Shape[] = [];
    for (const [, shapes] of groups) {
      const part: Geometry = { viewBox: geo.viewBox, shapes };
      const pb = bounds(part);
      const pc: [number, number] = [pb.x + pb.width / 2, pb.y + pb.height / 2];
      let dx = pc[0] - c[0], dy = pc[1] - c[1];
      const d = Math.hypot(dx, dy);
      // Lo que está justo en el centro sale en una dirección al azar.
      if (d < 1e-6) {
        const a = rand() * Math.PI * 2;
        [dx, dy] = [Math.cos(a), Math.sin(a)];
      } else [dx, dy] = [dx / d, dy / d];
      // Algo de desvío en la dirección y en la fuerza, según el caos.
      const dev = (rand() - 0.5) * p.chaos * 1.2;
      const [ux, uy] = [dx * Math.cos(dev) - dy * Math.sin(dev), dx * Math.sin(dev) + dy * Math.cos(dev)];
      const dist = p.force * size * t * (1 - p.chaos * 0.5 + rand() * p.chaos);
      const rot = ((rand() * 2 - 1) * p.spin * t * Math.PI) / 180;
      const k = 1 - p.shrink * t * (0.5 + rand() * 0.5);
      const [cs, sn] = [Math.cos(rot) * k, Math.sin(rot) * k];
      const moved = mapPoints(part, ([x, y]) => {
        const [lx, ly] = [x - pc[0], y - pc[1]];
        return [pc[0] + lx * cs - ly * sn + ux * dist, pc[1] + lx * sn + ly * cs + uy * dist];
      });
      out.push(...moved.shapes);
    }
    return { viewBox: geo.viewBox, shapes: out };
  },
});
