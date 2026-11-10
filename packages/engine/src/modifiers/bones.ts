import { mapPoints, subdivide, type Vec2 } from '../geometry';
import { defineModifier, deg, fromFraction } from '../modifier';

/**
 * Huesos: una cadena de 2 a 6 huesos iguales que recorre el dibujo de Start a End. Cada hueso gira sobre su
 * articulación (su ángulo, relativo al anterior) y arrastra lo que tiene alrededor; en cada articulación, el
 * paso de un hueso al otro es suave (Smooth). Cada punto pertenece al hueso que tiene a su altura de la
 * cadena, así que no hay pesos que pintar.
 * Con IK, los ángulos se calculan para que la punta llegue a Target (los ángulos que haya dicen hacia dónde
 * se dobla). El motor lo calcula en directo: la escena solo guarda los ángulos (o el objetivo) y sus claves.
 */
export const bones = defineModifier({
  type: 'bones',
  label: 'Bones',
  kind: 'deformer',
  params: {
    segments: { type: 'number', default: 3, min: 2, max: 6, step: 1, ramp: false, label: 'Segments', random: false },
    angle1: { type: 'angle', default: 12, label: 'Bone 1', showIf: { ik: ['false'] } },
    angle2: { type: 'angle', default: 12, label: 'Bone 2', showIf: { ik: ['false'] } },
    angle3: { type: 'angle', default: 12, label: 'Bone 3', showIf: { ik: ['false'], segments: ['3', '4', '5', '6'] } },
    angle4: { type: 'angle', default: 12, label: 'Bone 4', showIf: { ik: ['false'], segments: ['4', '5', '6'] } },
    angle5: { type: 'angle', default: 12, label: 'Bone 5', showIf: { ik: ['false'], segments: ['5', '6'] } },
    angle6: { type: 'angle', default: 12, label: 'Bone 6', showIf: { ik: ['false'], segments: ['6'] } },
    smooth: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'Smooth', ramp: false },
    ik: { type: 'boolean', default: false, label: 'IK', animatable: false },
    target: { type: 'point', default: [0.8, 0.1], unit: 'fraction', label: 'Target', showIf: { ik: ['true'] } },
    start: { type: 'point', default: [0, 0.5], unit: 'fraction', label: 'Start', group: 'Chain' },
    end: { type: 'point', default: [1, 0.5], unit: 'fraction', label: 'End', group: 'Chain' },
  },
  apply(geo, p, ctx) {
    const b = ctx.bounds;
    const A = fromFraction(b, p.start);
    const B = fromFraction(b, p.end);
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (L < 1e-9) return geo;
    const n = Math.max(2, Math.min(6, Math.round(p.segments)));
    const seg = L / n;
    const base = Math.atan2(B[1] - A[1], B[0] - A[0]);
    const [ux, uy] = [Math.cos(base), Math.sin(base)];

    // Ángulos de cada hueso (relativos al anterior): los del panel, o los que llevan la punta al objetivo.
    let rel = [p.angle1, p.angle2, p.angle3, p.angle4, p.angle5, p.angle6].slice(0, n).map(deg);
    if (p.ik) rel = solveIK(A, base, seg, rel, fromFraction(b, p.target));
    if (rel.every((a) => Math.abs(a) < 1e-9)) return geo;

    // Articulaciones en reposo (sobre la recta) y en pose; el giro acumulado de cada hueso.
    const rest: Vec2[] = Array.from({ length: n + 1 }, (_, k) => [A[0] + ux * seg * k, A[1] + uy * seg * k]);
    const pose: Vec2[] = [A];
    const turn: number[] = [];
    let acc = 0;
    for (let k = 0; k < n; k++) {
      acc += rel[k]!;
      turn.push(acc);
      const j = pose[k]!;
      pose.push([j[0] + Math.cos(base + acc) * seg, j[1] + Math.sin(base + acc) * seg]);
    }
    // Lo que hace el hueso k con un punto: girarlo sobre su articulación y llevarlo a la de la pose.
    const move = (k: number, x: number, y: number): Vec2 => {
      const [jx, jy] = rest[k]!, [px, py] = pose[k]!;
      const [c, s] = [Math.cos(turn[k]!), Math.sin(turn[k]!)];
      const [dx, dy] = [x - jx, y - jy];
      return [px + dx * c - dy * s, py + dx * s + dy * c];
    };
    // Media anchura de la zona de paso en cada articulación, en huesos (0 = sin paso; 0,5 = medio hueso).
    const w = Math.max(1e-6, Math.min(1, p.smooth) * 0.5);
    const smoothstep = (t: number) => t * t * (3 - 2 * t);

    return mapPoints(subdivide(geo, ctx.resolution), ([x, y]) => {
      // A qué altura de la cadena está (en huesos: 0 en Start, n en End); fuera, el primero o el último.
      const t = ((x - A[0]) * ux + (y - A[1]) * uy) / seg;
      const k = Math.max(0, Math.min(n - 1, Math.floor(t)));
      // Cerca de una articulación, mezcla de los dos huesos.
      const joint = Math.max(1, Math.min(n - 1, Math.round(t)));
      const d = t - joint;
      if (Math.abs(d) < w) {
        const mix = smoothstep((d + w) / (2 * w));
        const [ax, ay] = move(joint - 1, x, y);
        const [bx, by] = move(joint, x, y);
        return [ax + (bx - ax) * mix, ay + (by - ay) * mix];
      }
      return move(k, x, y);
    });
  },
});

/**
 * IK por FABRIK: la punta de la cadena (raíz fija en A) hacia el objetivo, en unas pocas pasadas. Parte de la
 * pose de los ángulos dados (si están todos a 0, de una curva leve), para que la cadena se doble hacia ese lado.
 * Devuelve los ángulos relativos de cada hueso.
 */
function solveIK(A: Vec2, base: number, seg: number, start: number[], target: Vec2): number[] {
  const n = start.length;
  const hint = start.every((a) => Math.abs(a) < 1e-6) ? start.map(() => deg(8)) : start;
  const pts: [number, number][] = [[A[0], A[1]]];
  let acc = 0;
  for (const a of hint) {
    acc += a;
    const j = pts[pts.length - 1]!;
    pts.push([j[0] + Math.cos(base + acc) * seg, j[1] + Math.sin(base + acc) * seg]);
  }
  const toward = (from: [number, number], to: [number, number]): [number, number] => {
    const d = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1e-9;
    return [from[0] + ((to[0] - from[0]) / d) * seg, from[1] + ((to[1] - from[1]) / d) * seg];
  };
  for (let it = 0; it < 24; it++) {
    // De la punta a la raíz, y de la raíz a la punta.
    pts[n] = [target[0], target[1]];
    for (let k = n - 1; k >= 0; k--) pts[k] = toward(pts[k + 1]!, pts[k]!);
    pts[0] = [A[0], A[1]];
    for (let k = 1; k <= n; k++) pts[k] = toward(pts[k - 1]!, pts[k]!);
    if (Math.hypot(pts[n]![0] - target[0], pts[n]![1] - target[1]) < seg * 1e-3) break;
  }
  // Ángulos relativos, sin saltos de una vuelta.
  const out: number[] = [];
  let prev = base;
  for (let k = 0; k < n; k++) {
    const a = Math.atan2(pts[k + 1]![1] - pts[k]![1], pts[k + 1]![0] - pts[k]![0]);
    let r = a - prev;
    while (r > Math.PI) r -= 2 * Math.PI;
    while (r < -Math.PI) r += 2 * Math.PI;
    out.push(r);
    prev = a;
  }
  return out;
}
