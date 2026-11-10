// Actuadores en el lienzo: el «wire» de un efecto (la esfera de Spherize, los anillos de Rotate 3D…)
// y los tiradores que cambian sus parámetros. Todo en coordenadas locales del nodo (las de su caja
// de referencia); el lienzo los lleva a pantalla con la matriz del nodo.
import type { Bounds, Vec2 } from '@svertik/engine';

type Params = Record<string, unknown>;

/** Arrastre: de los parámetros al empezar y los puntos (locales) de inicio y actual, a los parámetros que cambian. */
export type Drag = (p0: Params, from: Vec2, to: Vec2, snap: boolean) => Params;

export interface GizmoLine {
  pts: Vec2[];
  closed?: boolean;
  /** Color: acento, o los ejes de C4D (X rojo, Y verde, Z azul). */
  tone?: 'accent' | 'x' | 'y' | 'z';
  dashed?: boolean;
  /** Si se puede arrastrar la propia línea (los anillos de rotación). */
  drag?: Drag;
  label?: string;
}

export interface GizmoHandle {
  at: Vec2;
  label: string;
  drag: Drag;
}

export interface Gizmo {
  lines: GizmoLine[];
  handles: GizmoHandle[];
}

const SEG = 64;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const round = (n: number, k = 1000) => Math.round(n * k) / k;
const sizeOf = (b: Bounds) => Math.max(b.width, b.height) || 1;
const at = (b: Bounds, f: unknown): Vec2 => {
  const [fx, fy] = (f as Vec2 | undefined) ?? [0.5, 0.5];
  return [b.x + fx * b.width, b.y + fy * b.height];
};

/** Elipse de radios rx, ry girada `rot` grados alrededor de c (de `a0` a `a1`, en radianes). */
function ellipse(c: Vec2, rx: number, ry: number, rot = 0, a0 = 0, a1 = Math.PI * 2): Vec2[] {
  const cr = Math.cos(rad(rot)), sr = Math.sin(rad(rot));
  const n = Math.max(8, Math.round((SEG * Math.abs(a1 - a0)) / (Math.PI * 2)));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = a0 + ((a1 - a0) * i) / n;
    const x = rx * Math.cos(t), y = ry * Math.sin(t);
    return [c[0] + x * cr - y * sr, c[1] + x * sr + y * cr] as Vec2;
  });
}

/** Ángulo (grados) que gira el puntero alrededor de c entre `a` y `b`. */
const turn = (c: Vec2, a: Vec2, b: Vec2) => {
  let d = deg(Math.atan2(b[1] - c[1], b[0] - c[0]) - Math.atan2(a[1] - c[1], a[0] - c[0]));
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};
const snapDeg = (d: number, snap: boolean) => (snap ? Math.round(d / 15) * 15 : Math.round(d));

/** Tirador de radio: en el borde del círculo, a la derecha; arrastrarlo cambia `radius` (fracción del tamaño). */
function radiusHandle(b: Bounds, c: Vec2, R: number): GizmoHandle {
  return {
    at: [c[0] + R, c[1]],
    label: 'Radius',
    drag: (_p0, _from, to) => ({ radius: round(Math.min(2, Math.hypot(to[0] - c[0], to[1] - c[1]) / sizeOf(b)), 100) }),
  };
}

/** Rotate 3D: la misma rotación que el efecto (Z, luego X, luego Y), en proyección ortográfica. */
function rotate3(p: Params, v: [number, number, number]): Vec2 {
  const [sx, cx] = [Math.sin(rad(Number(p.rotateX) || 0)), Math.cos(rad(Number(p.rotateX) || 0))];
  const [sy, cy] = [Math.sin(rad(Number(p.rotateY) || 0)), Math.cos(rad(Number(p.rotateY) || 0))];
  const [sz, cz] = [Math.sin(rad(Number(p.rotateZ) || 0)), Math.cos(rad(Number(p.rotateZ) || 0))];
  let [x, y, z] = v;
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  return [x, y];
}

const builders: Record<string, (p: Params, b: Bounds) => Gizmo> = {
  spherize(p, b) {
    const c = at(b, p.center);
    const R = Number(p.radius) * sizeOf(b);
    const s = Number(p.strength) || 0;
    // La esfera: contorno, ecuador y meridiano. Más fuerza, más abombada (elipses más abiertas).
    const k = 0.12 + 0.3 * Math.min(1, Math.abs(s));
    const dashed = s < 0;
    return {
      lines: [
        { pts: ellipse(c, R, R), closed: true },
        { pts: ellipse(c, R, R * k), closed: true, dashed },
        { pts: ellipse(c, R * k, R), closed: true, dashed },
      ],
      handles: [radiusHandle(b, c, R)],
    };
  },

  twist(p, b) {
    const c = at(b, p.center);
    const R = Number(p.radius) * sizeOf(b);
    const a = Number(p.angle) || 0;
    // El giro: un arco desde las 3 en punto que recorre el ángulo (hasta una vuelta), con su punta.
    const span = rad(Math.max(-360, Math.min(360, a)));
    const r = R * 0.6;
    const arc = ellipse(c, r, r, 0, 0, span);
    const end = arc[arc.length - 1]!;
    // Punta: hacia donde avanza el arco (su tangente), con dos alas.
    const dir = Math.sign(span) || 1;
    const tg: Vec2 = [-Math.sin(span) * dir, Math.cos(span) * dir];
    const h = R * 0.08;
    const tip: Vec2[] = [
      [end[0] - tg[0] * h - tg[1] * h * 0.6, end[1] - tg[1] * h + tg[0] * h * 0.6],
      end,
      [end[0] - tg[0] * h + tg[1] * h * 0.6, end[1] - tg[1] * h - tg[0] * h * 0.6],
    ];
    return {
      lines: [{ pts: ellipse(c, R, R), closed: true }, { pts: arc }, ...(a ? [{ pts: tip }] : [])],
      handles: [
        radiusHandle(b, c, R),
        {
          at: end,
          label: 'Angle',
          // Arrastrar la punta alrededor del centro: el ángulo sigue al puntero (puede pasar de una vuelta).
          drag: (p0, from, to, snap) => ({ angle: snapDeg(Number(p0.angle) + turn(c, from, to), snap) }),
        },
      ],
    };
  },

  rotate3d(p, b) {
    const c = at(b, p.pivot);
    const R = sizeOf(b) * 0.35;
    const ring = (axis: 'x' | 'y' | 'z') =>
      Array.from({ length: SEG + 1 }, (_, i) => {
        const t = (i / SEG) * Math.PI * 2;
        const v: [number, number, number] =
          axis === 'x' ? [0, Math.cos(t), Math.sin(t)] : axis === 'y' ? [Math.cos(t), 0, Math.sin(t)] : [Math.cos(t), Math.sin(t), 0];
        const [x, y] = rotate3(p, v);
        return [c[0] + x * R, c[1] + y * R] as Vec2;
      });
    // Los anillos X e Y se arrastran en línea (0,5° por cada 1 % del tamaño); el Z, girando alrededor del pivote.
    const linear = (key: 'rotateX' | 'rotateY', i: 0 | 1, sign: number): Drag => (p0, from, to, snap) => ({
      [key]: snapDeg(Number(p0[key]) + (sign * (to[i] - from[i]) * 180) / sizeOf(b), snap),
    });
    return {
      lines: [
        { pts: ring('x'), closed: true, tone: 'x', label: 'Tilt X', drag: linear('rotateX', 1, 1) },
        { pts: ring('y'), closed: true, tone: 'y', label: 'Tilt Y', drag: linear('rotateY', 0, 1) },
        { pts: ring('z'), closed: true, tone: 'z', label: 'Spin Z', drag: (p0, from, to, snap) => ({ rotateZ: snapDeg(Number(p0.rotateZ) + turn(c, from, to), snap) }) },
      ],
      handles: [],
    };
  },

  wave(p, b) {
    const size = sizeOf(b);
    const A = Number(p.amplitude) * size;
    const L = Number(p.wavelength) * size || 1;
    const dir = rad(Number(p.direction) || 0);
    const ph = rad(Number(p.phase) || 0);
    const u: Vec2 = [Math.cos(dir), Math.sin(dir)];
    const n: Vec2 = [-u[1], u[0]];
    const c: Vec2 = [b.x + b.width / 2, b.y + b.height / 2];
    // La onda que sigue el efecto, por el centro de la caja y a lo largo de su dirección.
    const half = size * 0.6;
    const s0 = c[0] * u[0] + c[1] * u[1];
    const pts = Array.from({ length: 121 }, (_, i) => {
      const t = -half + (2 * half * i) / 120;
      const off = A * Math.sin((2 * Math.PI * (s0 + t)) / L + ph);
      return [c[0] + u[0] * t + n[0] * off, c[1] + u[1] * t + n[1] * off] as Vec2;
    });
    // Tirador en la primera cresta tras el centro: arriba/abajo cambia la amplitud; a lo largo, la longitud de onda.
    const k = Math.ceil(((s0 * 2 * Math.PI) / L + ph - Math.PI / 2) / (2 * Math.PI));
    const crestT = ((Math.PI / 2 - ph + 2 * Math.PI * k) * L) / (2 * Math.PI) - s0;
    const crest: Vec2 = [c[0] + u[0] * crestT + n[0] * A, c[1] + u[1] * crestT + n[1] * A];
    return {
      lines: [{ pts }, { pts: [[c[0] - u[0] * half, c[1] - u[1] * half], [c[0] + u[0] * half, c[1] + u[1] * half]], dashed: true }],
      handles: [
        {
          at: crest,
          label: 'Amplitude',
          drag: (p0, from, to) => {
            const dn = (to[0] - from[0]) * n[0] + (to[1] - from[1]) * n[1];
            return { amplitude: round(Math.max(0, Math.min(0.5, Number(p0.amplitude) + dn / size)), 1000) };
          },
        },
      ],
    };
  },
};

export function gizmoFor(type: string, params: Params, bounds: Bounds): Gizmo | null {
  const build = builders[type];
  return build && bounds.width + bounds.height > 0 ? build(params, bounds) : null;
}
