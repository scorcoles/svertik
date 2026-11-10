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
  /** Color: acento, o los colores de los ejes (X rojo, Y verde, Z azul). */
  tone?: 'accent' | 'x' | 'y' | 'z';
  dashed?: boolean;
  /** Zona (no línea): se agarra por todo su interior y no se dibuja (la bola de Rotate 3D). */
  area?: boolean;
  /** Cinta ancha y translúcida en vez de línea (los anillos de Rotate 3D). */
  ribbon?: boolean;
  /** Si se puede arrastrar la propia línea (los anillos de rotación). */
  drag?: Drag;
  label?: string;
}

export interface GizmoHandle {
  at: Vec2;
  label: string;
  drag: Drag;
  tone?: GizmoLine['tone'];
}

export interface Gizmo {
  lines: GizmoLine[];
  handles: GizmoHandle[];
}

/**
 * Efectos cuyo actuador va en un recuadro fijo en una esquina del lienzo, no sobre el dibujo
 * (Rotate 3D: sus anillos tapaban demasiado). Se construyen sobre CORNER_BOX, en píxeles del recuadro.
 */
export const cornerTypes = new Set(['rotate3d']);
export const CORNER_SIZE = 128;
export const CORNER_BOX: Bounds = { x: 0, y: 0, width: CORNER_SIZE, height: CORNER_SIZE };

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
    // Anillos fijos, legibles en 2D: Z, el círculo (se arrastra para girar); X, una elipse estrecha vertical;
    // Y, una estrecha horizontal. Un punto en cada anillo marca su ángulo.
    // Va en el recuadro de la esquina: centrado en él (el pivote del efecto tiene su propio tirador).
    const c = center(b);
    const R = sizeOf(b) * 0.38;
    const k = 0.3;
    // X e Y, más pequeños que Z: así ningún anillo toca a otro por fuera y siempre se sabe cuál se coge.
    const r = R * 0.7;
    const ax = rad(Number(p.rotateX) || 0), ay = rad(Number(p.rotateY) || 0), az = rad(Number(p.rotateZ) || 0);
    const spinZ: Drag = (p0, from, to, snap) => ({ rotateZ: snapDeg(Number(p0.rotateZ) + turn(c, from, to), snap) });
    // Bola de rastreo: arrastrar por dentro inclina en X e Y a la vez, como si se empujara la superficie
    // de una esfera (hacia abajo, la parte de arriba viene hacia delante). 90° por cada ancho del círculo.
    const k180 = 90 / (2 * R);
    const trackball: Drag = (p0, from, to, snap) => ({
      rotateX: snapDeg(Number(p0.rotateX) - (to[1] - from[1]) * k180, snap),
      rotateY: snapDeg(Number(p0.rotateY) + (to[0] - from[0]) * k180, snap),
    });
    return {
      lines: [
        { pts: ellipse(c, R * 0.86, R * 0.86), closed: true, area: true, label: 'Tilt', drag: trackball },
        { pts: ellipse(c, R, R), closed: true, tone: 'z', ribbon: true, label: 'Spin Z', drag: spinZ },
        // X e Y solo marcan el ángulo: se cambian arrastrando por dentro del círculo.
        { pts: ellipse(c, r * k, r), closed: true, tone: 'x', ribbon: true, label: 'Tilt X' },
        { pts: ellipse(c, r, r * k), closed: true, tone: 'y', ribbon: true, label: 'Tilt Y' },
      ],
      handles: [
        { at: [c[0] + Math.cos(az - Math.PI / 2) * R, c[1] + Math.sin(az - Math.PI / 2) * R], label: 'Spin Z', drag: spinZ, tone: 'z' },
        { at: [c[0] + Math.sin(ax) * r * k, c[1] - Math.cos(ax) * r], label: 'Tilt X', drag: trackball, tone: 'x' },
        { at: [c[0] + Math.sin(ay) * r, c[1] + Math.cos(ay) * r * k], label: 'Tilt Y', drag: trackball, tone: 'y' },
      ],
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

// ── El resto de deformadores

const center = (b: Bounds): Vec2 => [b.x + b.width / 2, b.y + b.height / 2];
const boxLine = (b: Bounds): GizmoLine => ({ pts: [[b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height]], closed: true, dashed: true });
const clamp = (n: number, a: number, z: number) => Math.max(a, Math.min(z, n));
const range = (n: number, f: (t: number) => Vec2) => Array.from({ length: n + 1 }, (_, i) => f(i / n));

Object.assign(builders, {
  bend(p: Params, b: Bounds): Gizmo {
    // El eje del dibujo, doblado como lo dobla el efecto; el tirador, en su extremo.
    const horizontal = p.axis !== 'vertical';
    const L = horizontal ? b.width : b.height;
    const theta = rad(Number(p.angle) || 0);
    const [cx, cy] = center(b);
    const R = Math.abs(theta) < 1e-6 ? Infinity : L / theta;
    const bendAt = (u: number): Vec2 => {
      const nu = R === Infinity ? u : R * Math.sin(u / R);
      const nv = R === Infinity ? 0 : R - R * Math.cos(u / R);
      return horizontal ? [cx + nu, cy + nv] : [cx - nv, cy + nu];
    };
    const axis = range(48, (t) => bendAt((t - 0.5) * L));
    const straight: Vec2[] = horizontal ? [[b.x, cy], [b.x + b.width, cy]] : [[cx, b.y], [cx, b.y + b.height]];
    return {
      lines: [{ pts: straight, dashed: true }, { pts: axis }],
      handles: [
        {
          at: axis[axis.length - 1]!,
          label: 'Angle',
          // Lo que se aparta el extremo del eje recto, en proporción a su longitud: 180° por cada mitad.
          drag: (p0, from, to, snap) => {
            const d = horizontal ? to[1] - from[1] : from[0] - to[0];
            return { angle: snapDeg(Number(p0.angle) + (d / (L / 2)) * 90, snap) };
          },
        },
      ],
    };
  },

  ripple(p: Params, b: Bounds): Gizmo {
    const c = at(b, p.center);
    const size = sizeOf(b);
    const L = Math.max(0.02, Number(p.wavelength)) * size;
    const rings: GizmoLine[] = [];
    for (let r = L, i = 0; r < size * 0.75 && i < 12; r += L, i++) rings.push({ pts: ellipse(c, r, r), closed: true, dashed: i > 0 });
    return {
      lines: rings,
      handles: [{ at: [c[0] + L, c[1]], label: 'Wavelength', drag: (_p0, _f, to) => ({ wavelength: round(clamp(Math.hypot(to[0] - c[0], to[1] - c[1]) / size, 0.02, 1), 100) }) }],
    };
  },

  taper(p: Params, b: Bounds): Gizmo {
    // El contorno de la caja estrechado como el dibujo: lados curvos si hay curva.
    const vertical = p.axis !== 'horizontal';
    const [cx, cy] = center(b);
    const amount = Number(p.amount) || 0;
    const curve = Number(p.curve) || 0;
    const f = (t: number) => Math.max(0, 1 - amount * (curve === 0 ? t : Math.pow(t, Math.pow(2, -curve * 2))));
    const side = (s: 1 | -1) =>
      range(32, (t) => (vertical ? [cx + s * (b.width / 2) * f(t), b.y + t * b.height] : [b.x + t * b.width, cy + s * (b.height / 2) * f(t)]));
    const a = side(1), z = side(-1).reverse();
    const end = a[a.length - 1]!;
    return {
      lines: [{ pts: [...a, ...z], closed: true }],
      handles: [
        {
          at: end,
          label: 'Amount',
          drag: (p0, from, to) => {
            const half = (vertical ? b.width : b.height) / 2 || 1;
            const d = vertical ? to[0] - from[0] : to[1] - from[1];
            return { amount: round(clamp(Number(p0.amount) - d / half, -1, 1), 100) };
          },
        },
      ],
    };
  },

  shear(p: Params, b: Bounds): Gizmo {
    const [cx, cy] = center(b);
    const tx = Math.tan(rad(clamp(Number(p.x) || 0, -85, 85)));
    const ty = Math.tan(rad(clamp(Number(p.y) || 0, -85, 85)));
    const m = ([x, y]: Vec2): Vec2 => [x + tx * (y - cy), y + ty * (x - cx)];
    const quad = boxLine(b).pts.map(m);
    const bottom = m([cx, b.y + b.height]);
    const right = m([b.x + b.width, cy]);
    return {
      lines: [boxLine(b), { pts: quad, closed: true }],
      handles: [
        { at: bottom, label: 'Shear X', drag: (_p0, _f, to, snap) => ({ x: snapDeg(deg(Math.atan((to[0] - cx) / (b.height / 2 || 1))), snap) }) },
        { at: right, label: 'Shear Y', drag: (_p0, _f, to, snap) => ({ y: snapDeg(deg(Math.atan((to[1] - cy) / (b.width / 2 || 1))), snap) }) },
      ],
    };
  },

  perspective(p: Params, b: Bounds): Gizmo {
    // Las cuatro esquinas ya tienen tirador (son puntos): aquí, el cuadrilátero que forman.
    return { lines: [boxLine(b), { pts: [at(b, p.topLeft), at(b, p.topRight), at(b, p.bottomRight), at(b, p.bottomLeft)], closed: true }], handles: [] };
  },

  envelope(p: Params, b: Bounds): Gizmo {
    // La malla: líneas de la superficie a u, v = 0, ½, 1 (los nueve puntos tienen su propio tirador).
    const names = ['p00', 'p10', 'p20', 'p01', 'p11', 'p21', 'p02', 'p12', 'p22'];
    const P = names.map((n, i) => at(b, p[n] ?? [(i % 3) / 2, Math.floor(i / 3) / 2]));
    const bern = (t: number) => [(1 - t) * (1 - t), 2 * t * (1 - t), t * t];
    const surf = (u: number, v: number): Vec2 => {
      const bu = bern(u), bv = bern(v);
      let x = 0, y = 0;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        const w = bu[i]! * bv[j]!;
        x += w * P[j * 3 + i]![0];
        y += w * P[j * 3 + i]![1];
      }
      return [x, y];
    };
    const lines: GizmoLine[] = [];
    for (const k of [0, 0.5, 1]) {
      lines.push({ pts: range(24, (t) => surf(t, k)), dashed: k === 0.5 });
      lines.push({ pts: range(24, (t) => surf(k, t)), dashed: k === 0.5 });
    }
    return { lines, handles: [] };
  },

  cylinder(p: Params, b: Bounds): Gizmo {
    // El cilindro en el que se enrolla: tapas (elipses) y laterales; el tirador del lateral cambia `wrap`.
    const W = b.width || 1;
    const R = W / (2 * Math.PI * Math.max(0.01, Number(p.wrap)));
    const [cx] = center(b);
    const k = 0.2;
    const top = b.y, bot = b.y + b.height;
    return {
      lines: [
        { pts: ellipse([cx, top], R, R * k), closed: true },
        { pts: ellipse([cx, bot], R, R * k, 0, 0, Math.PI) },
        { pts: ellipse([cx, bot], R, R * k, 0, Math.PI, Math.PI * 2), dashed: true },
        { pts: [[cx - R, top], [cx - R, bot]] },
        { pts: [[cx + R, top], [cx + R, bot]] },
      ],
      handles: [
        { at: [cx + R, (top + bot) / 2], label: 'Wrap', drag: (_p0, _f, to) => ({ wrap: round(clamp(W / (2 * Math.PI * Math.max(1e-6, Math.abs(to[0] - cx))), 0.01, 1), 100) }) },
      ],
    };
  },

  transform(p: Params, b: Bounds): Gizmo {
    // Un aro alrededor del pivote, ya movido, girado y escalado: arrastrar el aro mueve; su tirador gira y escala
    // a la vez. El pivote (punto) tiene su propio tirador.
    const pv = at(b, p.pivot);
    const x = Number(p.x) || 0, y = Number(p.y) || 0, s = Number(p.scale ?? 1), r = Number(p.rotation) || 0;
    const c: Vec2 = [pv[0] + x, pv[1] + y];
    const R0 = sizeOf(b) * 0.25;
    const R = R0 * s;
    const knob: Vec2 = [c[0] + Math.cos(rad(r)) * R, c[1] + Math.sin(rad(r)) * R];
    return {
      lines: [
        { pts: ellipse(c, R, R), closed: true, label: 'Move', drag: (p0, from, to) => ({ x: Math.round(Number(p0.x ?? 0) + to[0] - from[0]), y: Math.round(Number(p0.y ?? 0) + to[1] - from[1]) }) },
        { pts: [c, knob] },
      ],
      handles: [
        {
          at: knob,
          label: 'Rotate · scale',
          drag: (p0, from, to, snap) => {
            const d0 = Math.hypot(from[0] - c[0], from[1] - c[1]) || 1;
            return {
              rotation: snapDeg(Number(p0.rotation ?? 0) + turn(c, from, to), snap),
              scale: round(Math.max(0, (Number(p0.scale ?? 1) * Math.hypot(to[0] - c[0], to[1] - c[1])) / d0), 100),
            };
          },
        },
      ],
    };
  },

  mirror(p: Params, b: Bounds): Gizmo {
    // El eje del espejo, con un tirador en su centro para moverlo.
    const horizontal = p.axis !== 'vertical';
    const pos = Number(p.position ?? 1);
    const ext = sizeOf(b) * 0.15;
    const line: Vec2[] = horizontal
      ? [[b.x + pos * b.width, b.y - ext], [b.x + pos * b.width, b.y + b.height + ext]]
      : [[b.x - ext, b.y + pos * b.height], [b.x + b.width + ext, b.y + pos * b.height]];
    const mid: Vec2 = [(line[0]![0] + line[1]![0]) / 2, (line[0]![1] + line[1]![1]) / 2];
    return {
      lines: [{ pts: line, dashed: true }],
      handles: [
        {
          at: mid,
          label: 'Axis at',
          drag: (_p0, _f, to) => ({
            position: round(clamp(horizontal ? (to[0] - b.x) / (b.width || 1) : (to[1] - b.y) / (b.height || 1), -1, 2), 100),
          }),
        },
      ],
    };
  },

  field(p: Params, b: Bounds): Gizmo {
    // El campo: su forma (borde exterior) y, discontinuo, donde empieza la transición (Softness).
    const c = at(b, p.center);
    const R = Number(p.radius) * sizeOf(b);
    const inner = R * (1 - clamp(Number(p.softness), 0, 1));
    const a = rad(Number(p.angle) || 0);
    const [ux, uy] = [Math.cos(a), Math.sin(a)];
    const lines: GizmoLine[] = [];
    if (p.shape === 'linear') {
      const L = sizeOf(b);
      const seg = (d: number, dashed: boolean): GizmoLine => ({ pts: [[c[0] + ux * d - uy * L, c[1] + uy * d + ux * L], [c[0] + ux * d + uy * L, c[1] + uy * d - ux * L]], dashed });
      lines.push(seg(0, true), seg(R, false));
    } else if (p.shape === 'box') {
      const sq = (r: number): Vec2[] => [[-r, -r], [r, -r], [r, r], [-r, r]].map(([x, y]) => [c[0] + x! * ux - y! * uy, c[1] + x! * uy + y! * ux] as Vec2);
      lines.push({ pts: sq(R), closed: true }, { pts: sq(inner), closed: true, dashed: true });
    } else lines.push({ pts: ellipse(c, R, R), closed: true }, { pts: ellipse(c, inner, inner), closed: true, dashed: true });
    const edge: Vec2 = p.shape === 'linear' ? [c[0] + ux * R, c[1] + uy * R] : [c[0] + ux * R, c[1] + uy * R];
    return {
      lines,
      handles: [{ at: edge, label: 'Radius', drag: (_p0, _f, to) => ({ radius: round(clamp(Math.hypot(to[0] - c[0], to[1] - c[1]) / sizeOf(b), 0.01, 2), 100) }) }],
    };
  },

  clone(p: Params, b: Bounds): Gizmo {
    const c = center(b);
    const W = b.width, H = b.height, size = sizeOf(b);
    if (p.mode === 'radial') {
      const R = Number(p.radius) * size;
      const a = rad(Number(p.startAngle) || 0);
      return {
        lines: [{ pts: ellipse(c, R, R), closed: true, dashed: true }],
        handles: [
          {
            at: [c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R],
            label: 'Radius · start',
            drag: (p0, from, to, snap) => ({
              radius: round(clamp(Math.hypot(to[0] - c[0], to[1] - c[1]) / size, 0, 5), 100),
              startAngle: snapDeg(Number(p0.startAngle ?? 0) + turn(c, from, to), snap),
            }),
          },
        ],
      };
    }
    // Sobre otro objeto: ya se ve dónde caen las copias.
    if (p.mode === 'object') return { lines: [], handles: [] };
    if (p.mode === 'linear') {
      const n = Math.max(1, Math.round(Number(p.count)));
      const [ox, oy] = (p.offset as Vec2) ?? [1.1, 0];
      const t = (n - 1) / 2;
      const last: Vec2 = [c[0] + t * ox * W, c[1] + t * oy * H];
      const first: Vec2 = [c[0] - t * ox * W, c[1] - t * oy * H];
      return {
        lines: [{ pts: [first, last], dashed: true }],
        handles: n > 1 ? [{ at: last, label: 'Offset', drag: (_p0, _f, to) => ({ offset: [round((to[0] - c[0]) / t / (W || 1), 100), round((to[1] - c[1]) / t / (H || 1), 100)] }) }] : [],
      };
    }
    // Rejilla: la caja que ocupan los centros de las copias; el tirador de la esquina reparte la separación.
    const cols = Math.max(1, Math.round(Number(p.columns))), rows = Math.max(1, Math.round(Number(p.rows)));
    const [sx, sy] = (p.spacing as Vec2) ?? [1.1, 1.1];
    const hx = ((cols - 1) / 2) * sx * W, hy = ((rows - 1) / 2) * sy * H;
    const corner: Vec2 = [c[0] + hx, c[1] + hy];
    return {
      lines: [{ pts: [[c[0] - hx, c[1] - hy], [c[0] + hx, c[1] - hy], corner, [c[0] - hx, c[1] + hy]], closed: true, dashed: true }],
      handles:
        cols > 1 || rows > 1
          ? [{
              at: corner,
              label: 'Spacing',
              drag: (p0, _f, to) => {
                const [s0x, s0y] = (p0.spacing as Vec2) ?? [1.1, 1.1];
                return {
                  spacing: [
                    cols > 1 ? round(Math.max(0, (to[0] - c[0]) / (((cols - 1) / 2) * (W || 1))), 100) : s0x,
                    rows > 1 ? round(Math.max(0, (to[1] - c[1]) / (((rows - 1) / 2) * (H || 1))), 100) : s0y,
                  ],
                };
              },
            }]
          : [],
    };
  },
} satisfies Record<string, (p: Params, b: Bounds) => Gizmo>);

export function gizmoFor(type: string, params: Params, bounds: Bounds): Gizmo | null {
  const build = builders[type];
  return build && bounds.width + bounds.height > 0 ? build(params, bounds) : null;
}
