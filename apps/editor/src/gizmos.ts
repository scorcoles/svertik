// Canvas actuators: an effect's "wire" (Spherize's sphere, Rotate 3D's rings…)
// and the handles that change its parameters. All in the node's local coordinates (its reference
// box); the canvas takes them to the screen with the node's matrix.
import { apply, IDENTITY, invert, uprightBounds, type Mat, type Bounds, type Vec2 } from '@svertik/engine';

type Params = Record<string, unknown>;

/** Drag: from the starting parameters and the start and current (local) points, to the parameters that change. */
export type Drag = (p0: Params, from: Vec2, to: Vec2, snap: boolean) => Params;

export interface GizmoLine {
  pts: Vec2[];
  closed?: boolean;
  /** Colour: accent, or the axis colours (X red, Y green, Z blue). */
  tone?: 'accent' | 'x' | 'y' | 'z';
  dashed?: boolean;
  /** An area (not a line): grabbed anywhere inside and not drawn (Rotate 3D's ball). */
  area?: boolean;
  /** A wide translucent ribbon instead of a line (Rotate 3D's rings). */
  ribbon?: boolean;
  /** Whether the line itself can be dragged (the rotation rings). */
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
 * Effects whose actuator goes in a fixed box in a canvas corner, not over the drawing
 * (Rotate 3D: its rings covered too much). Built on CORNER_BOX, in the box's pixels.
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

/** Ellipse of radii rx, ry rotated `rot` degrees around c (from `a0` to `a1`, in radians). */
function ellipse(c: Vec2, rx: number, ry: number, rot = 0, a0 = 0, a1 = Math.PI * 2): Vec2[] {
  const cr = Math.cos(rad(rot)), sr = Math.sin(rad(rot));
  const n = Math.max(8, Math.round((SEG * Math.abs(a1 - a0)) / (Math.PI * 2)));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = a0 + ((a1 - a0) * i) / n;
    const x = rx * Math.cos(t), y = ry * Math.sin(t);
    return [c[0] + x * cr - y * sr, c[1] + x * sr + y * cr] as Vec2;
  });
}

/** Angle (degrees) the pointer turns around c between `a` and `b`. */
const turn = (c: Vec2, a: Vec2, b: Vec2) => {
  let d = deg(Math.atan2(b[1] - c[1], b[0] - c[0]) - Math.atan2(a[1] - c[1], a[0] - c[0]));
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};
const snapDeg = (d: number, snap: boolean) => (snap ? Math.round(d / 15) * 15 : Math.round(d));

/** Radius handle: on the circle's edge, on the right; dragging it changes `radius` (fraction of the size). */
function radiusHandle(b: Bounds, c: Vec2, R: number): GizmoHandle {
  return {
    at: [c[0] + R, c[1]],
    label: 'Radius',
    drag: (_p0, _from, to) => ({ radius: round(Math.min(2, Math.hypot(to[0] - c[0], to[1] - c[1]) / sizeOf(b)), 100) }),
  };
}

const builders: Record<string, (p: Params, b: Bounds) => Gizmo> = {
  rigidbody(p, b) {
    const c = center(b), velocity = (p.velocity as Vec2 | undefined) ?? [0, 0];
    const scale = 0.5;
    const end: Vec2 = [c[0] + velocity[0] * scale, c[1] + velocity[1] * scale];
    const speed = Math.hypot(...velocity);
    const head = Math.min(12, Math.max(6, sizeOf(b) * 0.08));
    const ux = speed ? velocity[0] / speed : 1, uy = speed ? velocity[1] / speed : 0;
    const base: Vec2 = [end[0] - ux * head, end[1] - uy * head];
    const wing: Vec2 = [uy * head * 0.55, -ux * head * 0.55];
    return {
      lines: speed > 0.5 && !p.immovable ? [
        { pts: [c, end] },
        { pts: [[base[0] + wing[0], base[1] + wing[1]], end, [base[0] - wing[0], base[1] - wing[1]]] },
      ] : [],
      handles: p.immovable ? [] : [{
        at: end,
        label: 'Velocity',
        drag: (p0, from, to) => {
          const v = (p0.velocity as Vec2 | undefined) ?? [0, 0];
          return { velocity: [round(v[0] + (to[0] - from[0]) / scale), round(v[1] + (to[1] - from[1]) / scale)] };
        },
      }],
    };
  },
  particles(p, b) {
    const c = at(b, p.center);
    const area = (p.area as Vec2 | undefined) ?? [0.15, 0.15];
    const reference = Number(p.referenceSize) > 0 ? Number(p.referenceSize) : 0;
    const areaWidth = reference || b.width, areaHeight = reference || b.height;
    const w = Math.max(0, area[0]) * areaWidth, h = Math.max(0, area[1]) * areaHeight;
    const emitter = p.emitter ?? 'circle';
    const direction = Number(p.direction ?? -90), spread = Math.min(360, Math.max(0, Number(p.spread ?? 90)));
    const radius = (reference || sizeOf(b)) * 0.35;
    const point = (angle: number, r = radius): Vec2 => [c[0] + Math.cos(rad(angle)) * r, c[1] + Math.sin(rad(angle)) * r];
    const move: Drag = (p0, from, to) => {
      const center = (p0.center as Vec2 | undefined) ?? [0.5, 0.5];
      return { center: [round(center[0] + (to[0] - from[0]) / (b.width || 1)), round(center[1] + (to[1] - from[1]) / (b.height || 1))] };
    };
    const outline: Vec2[] = emitter === 'circle' ? ellipse(c, w / 2, h / 2)
      : emitter === 'box' ? [[c[0] - w / 2, c[1] - h / 2], [c[0] + w / 2, c[1] - h / 2], [c[0] + w / 2, c[1] + h / 2], [c[0] - w / 2, c[1] + h / 2]]
      : emitter === 'line' ? [[c[0] - w / 2, c[1]], [c[0] + w / 2, c[1]]]
      : ellipse(c, (reference || sizeOf(b)) * 0.015, (reference || sizeOf(b)) * 0.015);
    return {
      lines: [
        { pts: outline, closed: emitter !== 'line', drag: move, label: 'Move emitter' },
        { pts: [c, point(direction)], tone: 'y' },
        { pts: [point(direction - spread / 2), c, point(direction + spread / 2)], dashed: true },
      ],
      handles: [
        { at: c, label: 'Emitter position', drag: move },
        { at: point(direction), label: 'Direction', tone: 'y', drag: (_p0, _from, to, snap) => ({ direction: snapDeg(deg(Math.atan2(to[1] - c[1], to[0] - c[0])), snap) }) },
        ...(emitter === 'point' ? [] : [{ at: [c[0] + w / 2, c[1] + (emitter === 'line' ? 0 : h / 2)] as Vec2, label: 'Emitter area', drag: ((_p0, _from, to) => ({ area: [round(2 * Math.abs(to[0] - c[0]) / (areaWidth || 1)), emitter === 'line' ? area[1] : round(2 * Math.abs(to[1] - c[1]) / (areaHeight || 1))] })) as Drag }]),
      ],
    };
  },
  gravity(p, b) {
    const c = at(b, p.floor ?? [0.5, 1.5]);
    const angle = Number(p.rotation ?? 0);
    const r = sizeOf(b);
    const u: Vec2 = [Math.cos(rad(angle)), Math.sin(rad(angle))];
    const move: Drag = (p0, from, to) => {
      const f = (p0.floor as Vec2 | undefined) ?? [0.5, 1.5];
      return { floor: [round(f[0] + (to[0] - from[0]) / (b.width || 1)), round(f[1] + (to[1] - from[1]) / (b.height || 1))] };
    };
    const end: Vec2 = [c[0] + u[0] * r, c[1] + u[1] * r];
    return {
      lines: [
        { pts: [[c[0] - u[0] * r * 3, c[1] - u[1] * r * 3], [c[0] + u[0] * r * 3, c[1] + u[1] * r * 3]], drag: move, label: 'Move floor' },
        { pts: [c, [c[0] - u[1] * r * 0.2, c[1] + u[0] * r * 0.2]], dashed: true },
      ],
      handles: [
        { at: c, label: 'Floor position', drag: move },
        { at: end, label: 'Floor rotation', drag: (p0, from, to, snap) => ({ rotation: snapDeg(Number(p0.rotation ?? 0) + turn(c, from, to), snap) }) },
      ],
    };
  },
  spherize(p, b) {
    const c = at(b, p.center);
    const R = Number(p.radius) * sizeOf(b);
    const s = Number(p.strength) || 0;
    // The sphere: outline, equator and meridian. More strength, more bulge (wider ellipses).
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
    // The twist: an arc from three o'clock that covers the angle (up to a full turn), with its tip.
    const span = rad(Math.max(-360, Math.min(360, a)));
    const r = R * 0.6;
    const arc = ellipse(c, r, r, 0, 0, span);
    const end = arc[arc.length - 1]!;
    // Tip: where the arc is heading (its tangent), with two wings.
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
          // Dragging the tip around the centre: the angle follows the pointer (it can pass a full turn).
          drag: (p0, from, to, snap) => ({ angle: snapDeg(Number(p0.angle) + turn(c, from, to), snap) }),
        },
      ],
    };
  },

  rotate3d(p, b) {
    // Fixed rings, readable in 2D: Z, the circle (dragged to rotate); X, a narrow vertical ellipse;
    // Y, a narrow horizontal one. A dot on each ring marks its angle.
    // It goes in the corner box: centred in it (the effect's pivot has its own handle).
    const c = center(b);
    const R = sizeOf(b) * 0.38;
    const k = 0.3;
    // X and Y smaller than Z: so no ring touches another from outside and it is always clear which one is grabbed.
    const r = R * 0.7;
    const ax = rad(Number(p.rotateX) || 0), ay = rad(Number(p.rotateY) || 0), az = rad(Number(p.rotateZ) || 0);
    const spinZ: Drag = (p0, from, to, snap) => ({ rotateZ: snapDeg(Number(p0.rotateZ) + turn(c, from, to), snap) });
    // Trackball: dragging inside tilts in X and Y at once, as if pushing the surface
    // of a sphere (down brings the top forward). 90° per circle width.
    const k180 = 90 / (2 * R);
    const trackball: Drag = (p0, from, to, snap) => ({
      rotateX: snapDeg(Number(p0.rotateX) - (to[1] - from[1]) * k180, snap),
      rotateY: snapDeg(Number(p0.rotateY) + (to[0] - from[0]) * k180, snap),
    });
    return {
      lines: [
        { pts: ellipse(c, R * 0.86, R * 0.86), closed: true, area: true, label: 'Tilt', drag: trackball },
        { pts: ellipse(c, R, R), closed: true, tone: 'z', ribbon: true, label: 'Spin Z', drag: spinZ },
        // X and Y only mark the angle: they change by dragging inside the circle.
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
    // The wave the effect follows, through the box centre and along its direction.
    const half = size * 0.6;
    const s0 = c[0] * u[0] + c[1] * u[1];
    const pts = Array.from({ length: 121 }, (_, i) => {
      const t = -half + (2 * half * i) / 120;
      const off = A * Math.sin((2 * Math.PI * (s0 + t)) / L + ph);
      return [c[0] + u[0] * t + n[0] * off, c[1] + u[1] * t + n[1] * off] as Vec2;
    });
    // Handle on the first crest after the centre: up/down changes the amplitude; along it, the wavelength.
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

// ── The other deformers

const center = (b: Bounds): Vec2 => [b.x + b.width / 2, b.y + b.height / 2];
const boxLine = (b: Bounds): GizmoLine => ({ pts: [[b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height]], closed: true, dashed: true });
const clamp = (n: number, a: number, z: number) => Math.max(a, Math.min(z, n));
const range = (n: number, f: (t: number) => Vec2) => Array.from({ length: n + 1 }, (_, i) => f(i / n));

Object.assign(builders, {
  bend(p: Params, b: Bounds): Gizmo {
    // The drawing's axis, bent as the effect bends it; the handle at its end.
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
          // How far the end moves off the straight axis, relative to its length: 180° per half.
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
    // The box outline narrowed like the drawing: curved sides if there is a curve.
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

  gather(p: Params, b: Bounds): Gizmo {
    // The fan of guide lines the drawing follows (as a row of bars would), and one handle per edge on the
    // middle line: drag it along its edge to squeeze towards that side (the middle line lands at ½ − bias/4).
    const alongX = p.axis !== 'y';
    const start = clamp(Number(p.start) || 0, -0.99, 0.99), end = clamp(Number(p.end) || 0, -0.99, 0.99);
    const squeeze = (t: number, bias: number) => t - bias * t * (1 - t);
    const pt = (t: number, s: number): Vec2 => (alongX ? [b.x + t * b.width, b.y + s * b.height] : [b.x + s * b.width, b.y + t * b.height]);
    const guide = (t: number) => ({ pts: [pt(squeeze(t, start), 0), pt(squeeze(t, end), 1)], dashed: t !== 0.5 });
    const across = alongX ? b.width : b.height;
    const handle = (key: 'start' | 'end', s: 0 | 1): GizmoHandle => ({
      at: pt(squeeze(0.5, key === 'start' ? start : end), s),
      label: key === 'start' ? 'Start' : 'End',
      drag: (p0, from, to, snap) => {
        const d = (alongX ? to[0] - from[0] : to[1] - from[1]) / (across || 1);
        const v = clamp((Number(p0[key]) || 0) - 4 * d, -0.99, 0.99);
        return { [key]: snap ? Math.round(v * 20) / 20 : round(v, 100) };
      },
    });
    return {
      lines: [boxLine(b), ...[0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875].map(guide)],
      handles: [handle('start', 0), handle('end', 1)],
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
    // The four corners already have handles (they are points): here, the quadrilateral they form.
    return { lines: [boxLine(b), { pts: [at(b, p.topLeft), at(b, p.topRight), at(b, p.bottomRight), at(b, p.bottomLeft)], closed: true }], handles: [] };
  },

  envelope(p: Params, b: Bounds): Gizmo {
    // The mesh: surface lines at u, v = 0, ½, 1 (the nine points have their own handles).
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
    // The cylinder it wraps around: caps (ellipses) and sides; the side handle changes `wrap`.
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
    // A ring around the pivot, already moved, rotated and scaled: dragging the ring moves; its handle rotates and scales
    // at once. The pivot (a point) has its own handle.
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
    // The mirror axis, with a handle at its centre to move it.
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
    // The field: its shape (outer edge) and, dashed, where the transition starts (Softness).
    const c = at(b, p.center);
    const size = sizeOf(b);
    const k = 1 - clamp(Number(p.softness), 0, 1);
    const a = rad(Number(p.angle) || 0);
    const [ux, uy] = [Math.cos(a), Math.sin(a)];
    // From the shape's local axes (turned by Angle) to the canvas.
    const toCanvas = (x: number, y: number): Vec2 => [c[0] + x * ux - y * uy, c[1] + x * uy + y * ux];
    const lines: GizmoLine[] = [];
    if (p.shape === 'linear') {
      const D = Number(p.distance) * size;
      const L = size;
      const seg = (d: number, dashed: boolean): GizmoLine => ({ pts: [toCanvas(d, -L), toCanvas(d, L)], dashed });
      lines.push(seg(0, true), seg(D, false));
      return {
        lines,
        handles: [{ at: toCanvas(D, 0), label: 'Distance', drag: (_p0, _f, to) => ({ distance: round(clamp(((to[0] - c[0]) * ux + (to[1] - c[1]) * uy) / size, 0.01, 2), 100) }) }],
      };
    }
    const hw = (Number(p.width) * size) / 2;
    const hh = (Number(p.height) * size) / 2;
    const outline = (s: number): Vec2[] => p.shape === 'box'
      ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => toCanvas(x! * hw * s, y! * hh * s))
      : Array.from({ length: 64 }, (_, i) => toCanvas(Math.cos((i / 64) * 2 * Math.PI) * hw * s, Math.sin((i / 64) * 2 * Math.PI) * hh * s));
    lines.push({ pts: outline(1), closed: true }, { pts: outline(k), closed: true, dashed: true });
    // Distance from the centre along each local axis, as a full size (fraction of the drawing).
    const along = (to: Vec2, vx: number, vy: number) => round(clamp((2 * Math.abs((to[0] - c[0]) * vx + (to[1] - c[1]) * vy)) / size, 0.01, 4), 100);
    return {
      lines,
      handles: [
        { at: toCanvas(hw, 0), label: 'Width', drag: (_p0, _f, to) => ({ width: along(to, ux, uy) }) },
        { at: toCanvas(0, hh), label: 'Height', drag: (_p0, _f, to) => ({ height: along(to, -uy, ux) }) },
      ],
    };
  },

  clone(p: Params, b: Bounds): Gizmo {
    const c = center(b);
    const W = b.width, H = b.height, size = sizeOf(b);
    if (p.mode === 'radial') {
      const R = Number(p.radius ?? 1) * size;
      const rings = Math.max(1, Math.min(64, Math.round(Number(p.rings ?? 1))));
      const gap = Math.max(0, Number(p.ringSpacing ?? 1.1)) * size;
      const a = rad(Number(p.startAngle) || 0);
      return {
        lines: Array.from({ length: rings }, (_, i) => ({ pts: ellipse(c, R + i * gap, R + i * gap), closed: true, dashed: true })),
        handles: [
          {
            at: [c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R],
            label: 'Radius · start',
            drag: (p0, from, to, snap) => ({
              radius: round(clamp(Math.hypot(to[0] - c[0], to[1] - c[1]) / size, 0, 5), 100),
              startAngle: snapDeg(Number(p0.startAngle ?? 0) + turn(c, from, to), snap),
            }),
          },
          ...(rings > 1 ? [{
            at: [c[0] + Math.cos(a + Math.PI / 2) * (R + gap), c[1] + Math.sin(a + Math.PI / 2) * (R + gap)] as Vec2,
            label: 'Ring spacing',
            drag: ((_p0, _from, to) => ({ ringSpacing: round(clamp((Math.hypot(to[0] - c[0], to[1] - c[1]) - R) / size, 0, 5), 100) })) as Drag,
          }] : []),
        ],
      };
    }
    // On another object: where the copies land is already visible.
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
    // Grid: the box the copies' centres take; the corner handle spreads the spacing.
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

export function gizmoFor(type: string, params: Params, bounds: Bounds, world: Mat = IDENTITY): Gizmo | null {
  if (type === 'crosshatch') return crosshatchGizmo(params, bounds, world);
  if (type === 'gravity') {
    const g = builders.gravity!(params, uprightBounds(bounds, world));
    const inverse = invert(world);
    const drag = (f: Drag): Drag => (p0, from, to, snap) => f(p0, apply(world, from), apply(world, to), snap);
    return {
      lines: g.lines.map((l) => ({ ...l, pts: l.pts.map((q) => apply(inverse, q)), ...(l.drag ? { drag: drag(l.drag) } : {}) })),
      handles: g.handles.map((h) => ({ ...h, at: apply(inverse, h.at), drag: drag(h.drag) })),
    };
  }
  const build = builders[type];
  return build && bounds.width + bounds.height > 0 ? build(params, bounds) : null;
}

/** Crosshatch's offset is measured in spacing units, rather than box fractions. */
function crosshatchGizmo(p: Params, b: Bounds, world: Mat): Gizmo {
  const fixed = p.fixLines === true;
  const toScreenSpace = (q: Vec2) => fixed ? apply(world, q) : q;
  const inverse = invert(world);
  const toLocal = (q: Vec2) => fixed ? apply(inverse, q) : q;
  const spacing = Math.max(1, Number(p.spacing ?? 6));
  const offset = (p.offset as Vec2 | undefined) ?? [0, 0];
  // Keep the actuator near the object even when the scene's screen origin is far away.
  const boxOrigin = toScreenSpace([b.x, b.y]);
  const origin: Vec2 = fixed ? [Math.round(boxOrigin[0] / spacing) * spacing, Math.round(boxOrigin[1] / spacing) * spacing] : boxOrigin;
  const c: Vec2 = [origin[0] + (offset[0] % 1) * spacing, origin[1] + (offset[1] % 1) * spacing];
  const angle = Number(p.angle ?? 45), a = rad(angle);
  const u: Vec2 = [Math.cos(a), Math.sin(a)], v: Vec2 = [-u[1], u[0]];
  const worldScale = fixed ? Math.hypot(world[0], world[1]) : 1;
  const arm = Math.max(32, sizeOf(b) * worldScale * 0.3);
  // A separate offset handle follows the pointer continuously. One cell takes a comfortable
  // drag, independent of the much smaller screen spacing; its display never wraps at a cell.
  const offsetTravel = Math.max(60, spacing * 4);
  const offsetAt: Vec2 = [origin[0] - v[0] * 40 + offset[0] * offsetTravel, origin[1] - v[1] * 40 + offset[1] * offsetTravel];
  const point = (along: number, across: number): Vec2 => toLocal([c[0] + u[0] * along + v[0] * across, c[1] + u[1] * along + v[1] * across]);
  return {
    lines: [
      ...[-2, -1, 0, 1, 2, 3].map((i) => ({ pts: [point(-arm, i * spacing), point(arm, i * spacing)], dashed: true })),
    ],
    handles: [
      { at: toLocal(offsetAt), label: 'Offset', drag: (p0, from, to, snap) => {
        const start = toScreenSpace(from), end = toScreenSpace(to);
        const old = (p0.offset as Vec2 | undefined) ?? [0, 0];
        return { offset: old.map((value, i) => round(value + (end[i]! - start[i]!) / offsetTravel, snap ? 4 : 1000)) };
      } },
      { at: point(arm, 0), label: 'Angle', drag: (p0, from, to, snap) => ({ angle: snapDeg(Number(p0.angle ?? 45) + turn(c, toScreenSpace(from), toScreenSpace(to)), snap) }) },
      { at: point(0, spacing * 3), label: 'Spacing', drag: (p0, from, to, snap) => {
        const start = toScreenSpace(from), end = toScreenSpace(to);
        const delta = ((end[0] - start[0]) * v[0] + (end[1] - start[1]) * v[1]) / 3;
        return { spacing: round(Math.max(1, Math.min(100, Number(p0.spacing ?? 6) + delta)), snap ? 1 : 100) };
      } },
    ],
  };
}
