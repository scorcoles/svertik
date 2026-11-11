import { cubicAt, line, mapSubPaths, splitCubic, type Cubic, type SubPath, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * Redondea las esquinas: en cada punto donde el trazado cambia de dirección de golpe, corta los dos tramos
 * que llegan y los une con un arco (o con una recta, en `chamfer`). Lo que ya es curva suave no se toca.
 * - radius: el radio del arco, en unidades del dibujo. Si los tramos son cortos, el arco se encoge para
 *   caber (como mucho, la mitad de un tramo que también se redondea por el otro lado).
 * - limit: solo las esquinas con un ángulo interior menor que este (180: todas; 90: solo las agudas y rectas).
 */
export const roundcorners = defineModifier({
  type: 'roundcorners',
  label: 'Round Corners',
  kind: 'deformer',
  params: {
    radius: { type: 'number', default: 12, min: 0, max: 500, step: 0.5, unit: 'px', label: 'Radius', random: [2, 60] },
    limit: { type: 'number', default: 180, min: 0, max: 180, step: 1, unit: '°', label: 'Angle limit', ramp: false, neutral: 180 },
    shape: { type: 'enum', default: 'round', options: ['round', 'chamfer'] as const, animatable: false, label: 'Shape' },
  },
  apply(geo, p) {
    if (p.radius <= 0) return geo;
    return mapSubPaths(geo, (sp) => roundSubPath(sp, p.radius, p.limit, p.shape === 'chamfer'));
  },
});

/** Por debajo de este giro, no es una esquina (curvas suaves aproximadas). */
const MIN_TURN = (1 * Math.PI) / 180;
const EPS = 1e-6;

interface Seg {
  p0: Vec2;
  s: Cubic;
  len: number;
}

function roundSubPath(sp: SubPath, radius: number, limitDeg: number, chamfer: boolean): SubPath {
  // Tramos con su punto de partida; fuera los de longitud nula. Un cerrado acaba en su inicio.
  const segs: Seg[] = [];
  let p0 = sp.start;
  for (const s of sp.segs) {
    const len = length(p0, s);
    if (len > EPS) segs.push({ p0, s, len });
    p0 = s.p;
  }
  if (sp.closed && dist(p0, sp.start) > EPS) segs.push({ p0, s: line(p0, sp.start), len: dist(p0, sp.start) });
  const n = segs.length;
  if (n < 2) return sp;

  // Esquinas: la k está entre el tramo k-1 y el k (en un abierto, de 1 a n-1; en un cerrado, todas).
  const turnLimit = Math.PI - (Math.max(0, Math.min(180, limitDeg)) * Math.PI) / 180;
  const turns: number[] = new Array(n).fill(0);
  for (let k = sp.closed ? 0 : 1; k < n; k++) {
    const a = segs[(k - 1 + n) % n]!, b = segs[k]!;
    const t = angleBetween(endTangent(a), startTangent(b));
    if (t > MIN_TURN && t >= turnLimit - EPS) turns[k] = t;
  }
  if (turns.every((t) => t === 0)) return sp;

  // Cuánto se corta a cada lado de cada esquina: R·tan(giro/2), sin pasar de lo que cabe en cada tramo.
  const room = (i: number, otherEnd: number) => segs[i]!.len * (turns[otherEnd] ? 0.5 : 1) * 0.999;
  const cut: number[] = turns.map((t, k) => {
    if (!t) return 0;
    const want = radius * Math.tan(Math.min(t, Math.PI - 1e-3) / 2);
    const prev = (k - 1 + n) % n;
    return Math.min(want, room(prev, prev), room(k, (k + 1) % n));
  });

  // Cada tramo, recortado por sus dos puntas.
  const trimmed: { start: Vec2; s: Cubic }[] = segs.map((g, i) => {
    let from = g.p0;
    let s = g.s;
    const head = cut[i]!;
    const tail = sp.closed || i < n - 1 ? cut[(i + 1) % n]! : 0;
    if (head > 0) {
      const t = paramAt(from, s, head);
      const [, rest] = splitCubic(from, s, t);
      from = cubicAt(g.p0, g.s, t);
      s = rest;
    }
    if (tail > 0) {
      const len = length(from, s);
      const t = paramAt(from, s, Math.max(0, len - tail));
      [s] = splitCubic(from, s, t);
    }
    return { start: from, s };
  });

  // Arco entre el final de un tramo y el principio del siguiente.
  const arc = (a: { start: Vec2; s: Cubic }, b: { start: Vec2; s: Cubic }): Cubic => {
    const from = a.s.p, to = b.start;
    if (chamfer) return line(from, to);
    const ta = unit(endTangent({ p0: a.start, s: a.s, len: 0 }));
    const tb = unit(startTangent({ p0: b.start, s: b.s, len: 0 }));
    const turn = angleBetween(ta, tb);
    if (turn < MIN_TURN) return line(from, to);
    // Radio que pasa por los dos puntos con esas tangentes; asas de un arco circular (4/3·tan(giro/4)).
    const r = dist(from, to) / (2 * Math.sin(turn / 2));
    const k = (4 / 3) * Math.tan(turn / 4) * r;
    return { c1: [from[0] + ta[0] * k, from[1] + ta[1] * k], c2: [to[0] - tb[0] * k, to[1] - tb[1] * k], p: to };
  };

  const out: Cubic[] = [];
  for (let i = 0; i < n; i++) {
    out.push(trimmed[i]!.s);
    const next = (i + 1) % n;
    if ((sp.closed || i < n - 1) && turns[next]) out.push(arc(trimmed[i]!, trimmed[next]!));
  }
  return { start: trimmed[0]!.start, segs: out, closed: sp.closed };
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const unit = (v: Vec2): Vec2 => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const angleBetween = (a: Vec2, b: Vec2) => {
  const la = Math.hypot(a[0], a[1]), lb = Math.hypot(b[0], b[1]);
  if (la < EPS || lb < EPS) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / (la * lb))));
};

/** Dirección al llegar al final del tramo (el control más cercano que no coincida con la punta). */
function endTangent({ p0, s }: Seg): Vec2 {
  for (const q of [s.c2, s.c1, p0]) if (dist(q, s.p) > EPS) return sub(s.p, q);
  return [0, 0];
}
/** Dirección al salir del principio del tramo. */
function startTangent({ p0, s }: Seg): Vec2 {
  for (const q of [s.c1, s.c2, s.p]) if (dist(q, p0) > EPS) return sub(q, p0);
  return [0, 0];
}

const SAMPLES = 24;
function length(p0: Vec2, s: Cubic): number {
  let len = 0;
  let prev = p0;
  for (let i = 1; i <= SAMPLES; i++) {
    const q = cubicAt(p0, s, i / SAMPLES);
    len += dist(prev, q);
    prev = q;
  }
  return len;
}
/** El t en que se ha recorrido `d` desde el principio del tramo (por muestras, interpolando). */
function paramAt(p0: Vec2, s: Cubic, d: number): number {
  let acc = 0;
  let prev = p0;
  for (let i = 1; i <= SAMPLES; i++) {
    const q = cubicAt(p0, s, i / SAMPLES);
    const step = dist(prev, q);
    if (acc + step >= d) return (i - 1 + (step > 0 ? (d - acc) / step : 0)) / SAMPLES;
    acc += step;
    prev = q;
  }
  return 1;
}
