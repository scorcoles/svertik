// Print Poster demo: a 1200×4800 glitch print built only from primitives and stock effects.
// Grey ground, grid panels (a 1 px bar repeated with Clone), checker slabs (a square Halftone at 45°
// whose cells touch at the corners), navy→crimson Gradient patches, thick red frames, wavy ribbons
// (long bars bent by Wave, some Pixelated), a scatter of crosses, squares, outlines, triangles and
// squiggles, and cyan/red offset copies for the glitch. Seeded: the same seed always gives the same print.
import type { SceneNode, SceneV1 } from '@svertik/engine';

const W = 1200, H = 4800;
const NAVY = '#0c2a6b', RED = '#d11a34', CYAN = '#2ee8ea', WHITE = '#f4f4f7', BLACK = '#1b1b1f';
const GROUND = '#dadada', GRIDBG = '#e2e2e2', GRIDLINE = '#9c9c9c';

/** Small seeded generator (mulberry32): uniform floats in [0, 1). */
function seeded(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const uniform = (lo: number, hi: number) => lo + (hi - lo) * next();
  const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)]!;
  const weighted = <T>(list: readonly T[], weights: readonly number[]) => {
    let r = next() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) if ((r -= weights[i]!) < 0) return list[i]!;
    return list[list.length - 1]!;
  };
  return { next, uniform, pick, weighted };
}

export function printPosterProject(seed = 7) {
  const R = seeded(seed);
  const objects: SceneNode[] = []; // back to front; reversed at the end (first in the scene = in front)
  let n = 0;
  const uid = (p: string) => `${p}-${++n}`;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const mod = (type: string, params: Record<string, unknown>) => ({ id: uid(type), type, params });

  const shape = (kind: string, x: number, y: number, params: Record<string, unknown>, stack: ReturnType<typeof mod>[] = [], name = kind, rotation = 0) => {
    const node = { kind: 'shape', id: uid(kind), name, shape: kind, transform: { x: r1(x), y: r1(y), ...(rotation ? { rotation } : {}) }, params, stack } as unknown as SceneNode;
    objects.push(node);
    return node;
  };
  const rect = (x: number, y: number, w: number, h: number, color: string | null, stroke: string | null = null, sw = 2, stack: ReturnType<typeof mod>[] = [], name = 'Rect', rotation = 0) =>
    shape('rectangle', x, y, {
      width: r1(w), height: r1(h), fill: color !== null, fillColor: color ?? '#000000',
      ...(stroke ? { stroke: true, strokeColor: stroke, strokeWidth: sw, strokeJoin: 'miter', strokeCap: 'butt' } : {}),
    }, stack, name, rotation);

  const top = -H / 2; // the document's origin is its centre

  // Ground
  rect(0, 0, W, H, GROUND, null, 2, [], 'Ground');

  // Grid panels: a light panel and thin lines (a 1 px bar repeated: Clone's offset is a fraction of its own box, so px).
  const grid = (x: number, y: number, w: number, h: number, step = 38) => {
    rect(x, y, w, h, GRIDBG, null, 2, [], 'Grid panel');
    rect(x - w / 2 + step / 2, y, 1, h, GRIDLINE, null, 2, [mod('clone', { mode: 'linear', count: Math.min(64, Math.floor(w / step)), offset: [step, 0] })], 'Grid V');
    rect(x, y - h / 2 + step / 2, w, 1, GRIDLINE, null, 2, [mod('clone', { mode: 'linear', count: Math.min(64, Math.floor(h / step)), offset: [0, step] })], 'Grid H');
  };
  for (const [gy, gh] of [[-1950, 900], [-700, 700], [650, 1100], [1900, 1000]] as const) grid(R.pick([-260, 0, 240]), gy, R.uniform(760, 1100), gh);

  // Checker slabs: grey with a black square Halftone (45°, cells touching at the corners).
  const checker = (x: number, y: number, w: number, h: number, spacing = 9) => {
    rect(x, y, w, h, '#cfcfcf', null, 2, [], 'Checker ground');
    rect(x, y, w, h, '#808080', null, 2, [mod('halftone', { spacing, angle: 45, min: 0.7071, max: 0.7071, shape: 'square', merge: true }), mod('color', { mode: 'solid', color: '#161616', target: 'fill' })], 'Checker');
  };
  checker(170, -1560, 900, 760);
  checker(-330, -230, 760, 820);
  checker(250, 1180, 820, 700);
  checker(-200, 2150, 900, 520);

  // Navy → crimson patches
  rect(310, -1050, 640, 520, NAVY, null, 2, [mod('gradient', { kind: 'linear', from: NAVY, to: '#a3163a', angle: -35, midpoint: 0.45 })], 'Gradient patch');
  rect(240, -1180, 360, 220, NAVY, null, 2, [], 'Navy block');
  rect(-150, 1700, 520, 380, NAVY, null, 2, [mod('gradient', { kind: 'linear', from: '#1a2f7a', to: RED, angle: 20, midpoint: 0.6 })], 'Gradient patch 2');

  // Thick red frames and bars
  for (const [fx, fy, fw, fh, sw] of [[-260, -520, 760, 760, 40], [-430, 520, 520, 420, 34], [380, 2000, 600, 620, 40], [-120, -1700, 420, 300, 22]] as const) rect(fx, fy, fw, fh, null, RED, sw, [], 'Red frame');
  for (const [bx, by, bw, bh] of [[-280, -60, 820, 70], [-560, 40, 90, 320], [60, 900, 900, 60], [-380, 2260, 700, 80]] as const) rect(bx, by, bw, bh, RED, null, 2, [], 'Red bar');

  // Outlined frames
  for (let i = 0; i < 10; i++) {
    const s = R.uniform(120, 420);
    rect(R.uniform(-520, 520), R.uniform(top + 200, -top - 200), s * R.uniform(0.7, 1.3), s, null, R.pick([WHITE, CYAN, CYAN, WHITE, NAVY]), R.pick([10, 14, 18, 22]), [], 'Frame');
  }

  // Wavy ribbons: long filled bars bent by Wave (a wide stroke is capped, so they are shapes)
  const ribbon = (y: number, color: string, thick: number, amplitude: number, wavelength: number, phase: number, x = 0, length = 1700, rotation = 0, pixel = 0) =>
    rect(x, y, length, thick, color, null, 2, [mod('wave', { amplitude, wavelength, phase, direction: 0 }), ...(pixel ? [mod('pixelate', { size: pixel, shape: 'square' })] : [])], 'Ribbon', rotation);
  ribbon(-2230, CYAN, 110, 0.025, 0.42, 30, 120, 1700, -6, 14);
  ribbon(-1820, WHITE, 34, 0.012, 0.2, 90, -300, 1300, -8);
  ribbon(-1835, BLACK, 10, 0.012, 0.2, 90, -300, 1300, -8);
  ribbon(-640, RED, 26, 0.018, 0.16, 0, -200, 900, -4);
  ribbon(260, RED, 70, 0.03, 0.28, 140, 220, 1500, -12);
  ribbon(1250, CYAN, 40, 0.02, 0.18, 60, -150, 1400, 5);
  ribbon(1560, WHITE, 60, 0.03, 0.3, 200, 100, 1600, -3, 10);
  ribbon(2020, RED, 90, 0.025, 0.35, 10, -80, 1700, 8, 12);
  ribbon(2290, CYAN, 30, 0.02, 0.15, 120, 200, 1200, -6);

  // Scatter
  const palette = [NAVY, NAVY, NAVY, NAVY, NAVY, RED, RED, RED, RED, CYAN, CYAN, CYAN, WHITE, WHITE, WHITE, BLACK, BLACK];
  for (let i = 0; i < 950; i++) {
    const x = R.uniform(-W / 2 + 40, W / 2 - 40), y = R.uniform(top + 40, -top - 40);
    const kind = R.weighted(['cross', 'square', 'outline', 'tri', 'squiggle', 'block'] as const, [28, 22, 22, 12, 18, 2]);
    const c = R.pick(palette);
    const big = R.next() < 0.05;
    if (kind === 'cross') {
      const s = big ? R.uniform(60, 130) : R.uniform(10, 38);
      shape('cross', x, y, { size: r1(s), width: r1(s * R.uniform(0.22, 0.34)), fill: true, fillColor: c }, [], 'Cross');
    } else if (kind === 'square') {
      const s = R.uniform(8, 40);
      rect(x, y, s, s * R.uniform(0.8, 1.2), c, null, 2, [], 'Square');
    } else if (kind === 'block') {
      const s = R.uniform(90, 220);
      rect(x, y, s, s * R.uniform(0.6, 1.1), c, null, 2, [], 'Block');
    } else if (kind === 'outline') {
      const s = big ? R.uniform(140, 240) : R.uniform(16, 90);
      rect(x, y, s, s * R.uniform(0.75, 1.25), null, c, R.pick([1.5, 2, 2, 3, 5]), [], 'Outline');
    } else if (kind === 'tri') {
      const s = big ? R.uniform(60, 110) : R.uniform(12, 40);
      shape('polygon', x, y, { radius: r1(s), sides: 3, rotation: r1(R.pick([0, 30, 90, 150, 210, 270]) + R.uniform(-12, 12)), fill: true, fillColor: c }, [], 'Triangle');
    } else {
      shape('line', x, y, { length: r1(R.uniform(50, 130)), angle: r1(R.uniform(-15, 15)), stroke: true, strokeColor: R.pick([NAVY, RED, WHITE, CYAN, BLACK]), strokeWidth: R.pick([1.5, 2, 3]), fill: false },
        [mod('wave', { amplitude: 0.06, wavelength: r1(R.uniform(0.12, 0.22) * 100) / 100, phase: r1(R.uniform(0, 360)), direction: 0 })], 'Squiggle');
    }
  }

  // Glitch: cyan/red offset copies of some solid pieces, just under them
  const solids = objects.filter((o) => ['Cross', 'Square', 'Block', 'Triangle'].includes(o.name));
  for (let i = 0; i < 110 && solids.length; i++) {
    const o = solids.splice(Math.floor(R.next() * solids.length), 1)[0]! as SceneNode & { params: Record<string, unknown>; transform: { x: number; y: number } };
    const [dx, dy] = R.pick([[-8, 0], [8, 0], [-12, 4], [10, -4]] as const);
    const copy = structuredClone(o);
    copy.id = uid('glitch');
    copy.name = `Glitch ${o.name}`;
    copy.params.fillColor = R.pick([CYAN, RED]);
    copy.transform = { ...o.transform, x: r1(o.transform.x + dx), y: r1(o.transform.y + dy) };
    objects.splice(objects.indexOf(o), 0, copy);
  }

  const scene: SceneV1 = {
    version: 1,
    seedGenerator: seed,
    document: { width: W, height: H },
    notes: 'Print Poster demo: a 1200×4800 glitch print made only of primitives and stock effects (Clone grids, a square Halftone for the checker, Gradient, Wave ribbons with Pixelate, offset copies for the glitch). Generated from a seed in demo-poster.ts.',
    objects: objects.reverse(),
  };
  return { svertik: 'project', version: 1, name: 'print-poster', canvas: GROUND, scene };
}
