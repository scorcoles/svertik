import { ring, simplify } from '../clip';
import type { Pair, Ring } from '../polygon';
import type { Cubic, Shape, SubPath, Vec2 } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * Metaball: the elements (children of a group, copies of a Clone…; untagged, each shape) melt like drops
 * when they get close. Each one gives its signed distance (negative inside); they join with a smooth union
 * of reach `reach` (px): further than `reach` they don't touch; closer, a neck grows between them. The outline
 * (where the field equals `grow`) comes out as a real path, with smooth curves; it can take a stroke,
 * a gradient or more effects. Style: the front element's. Open lines stay as they were.
 */
export const metaball = defineModifier({
  type: 'metaball',
  label: 'Metaball',
  kind: 'generator',
  params: {
    reach: { type: 'number', default: 30, min: 0, max: 400, step: 0.5, unit: 'px', label: 'Reach', random: [5, 80] },
    grow: { type: 'number', default: 0, min: -100, max: 100, step: 0.5, unit: 'px', label: 'Grow', random: [-5, 10] },
    quality: { type: 'number', default: 100, min: 30, max: 400, step: 1, label: 'Quality', ramp: false, random: false, animatable: false },
  },
  apply(geo, p) {
    const tagged = geo.shapes.some((s) => s.clone !== undefined);
    const elements = new Map<number, Shape[]>();
    geo.shapes.forEach((s, i) => {
      const k = tagged ? (s.clone ?? -1) : i;
      elements.set(k, [...(elements.get(k) ?? []), s]);
    });
    // Box of everything: for the grid and to size the rings.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of geo.shapes) for (const sp of s.subpaths) for (const q of [sp.start, ...sp.segs.map((g) => g.p)]) {
      x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
    }
    if (!(x1 > x0) && !(y1 > y0)) return geo;
    const quality = Math.max(30, Math.min(400, Math.round(p.quality)));
    const k = Math.max(0, p.reach);
    const grow = p.grow;
    const pad = k + Math.max(0, grow) + 2;
    const cell = Math.max(x1 - x0, y1 - y0, 1) / quality;
    // The rings, with segments of about three cells: the error on a curve is much smaller than a cell.
    const step = cell * 3;

    // Each element: its (closed) rings and its box.
    const solids: { shapes: Shape[]; rings: Ring[]; box: [number, number, number, number] }[] = [];
    const lines: Shape[] = [];
    for (const shapes of elements.values()) {
      const rings: Ring[] = [];
      for (const s of shapes) {
        for (const sp of s.subpaths) {
          if (!sp.closed) continue;
          // A large, smooth curve allows longer segments with the same error (sagitta ≈ segment² / 8·radius):
          // at a twelfth of its shorter side, the error stays below a cell on a circle.
          const pts = [sp.start, ...sp.segs.map((g) => g.p)];
          const w = Math.max(...pts.map((q) => q[0])) - Math.min(...pts.map((q) => q[0]));
          const h = Math.max(...pts.map((q) => q[1])) - Math.min(...pts.map((q) => q[1]));
          rings.push(ring(sp, Math.max(step, Math.min(w, h) / 12)));
        }
        const open = s.subpaths.filter((sp) => !sp.closed);
        if (open.length) lines.push({ ...s, subpaths: open, clone: 0 });
      }
      const ok = rings.filter((r) => r.length >= 4);
      if (!ok.length) continue;
      const xs = ok.flatMap((r) => r.map((q) => q[0])), ys = ok.flatMap((r) => r.map((q) => q[1]));
      solids.push({ shapes, rings: ok, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
    }
    if (!solids.length) return geo;

    // Grid with a margin: the edges are outside everything (the outline always closes).
    const gx0 = x0 - pad - cell, gy0 = y0 - pad - cell;
    const nx = Math.ceil((x1 - x0 + 2 * pad) / cell) + 3, ny = Math.ceil((y1 - y0 + 2 * pad) / cell) + 3;
    const field = new Float64Array(nx * ny).fill(Infinity);
    // Far from an element (more than twice the reach), its distance to the box is enough: the outline doesn't change.
    const near = 2 * k + Math.abs(grow) + 2 * cell;
    const fieldAt = (x: number, y: number) => {
      let f = Infinity;
      for (const el of solids) {
        const [bx0, by0, bx1, by1] = el.box;
        const dx = Math.max(bx0 - x, 0, x - bx1), dy = Math.max(by0 - y, 0, y - by1);
        const boxD = Math.hypot(dx, dy);
        f = smin(f, boxD > near ? boxD : signedDistance(x, y, el.rings), k);
      }
      return f - grow;
    };
    // Exact values are only needed near the outline. First the field on a coarse grid (every S nodes);
    // in a coarse cell with its four corners on the same side and far from the outline (the field changes no
    // faster than the distance), the fine nodes are interpolated: only which side they are on matters.
    const S = 4;
    const cx = Math.ceil((nx - 1) / S) + 2, cy = Math.ceil((ny - 1) / S) + 2;
    const coarse = new Float64Array(cx * cy);
    for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) coarse[j * cx + i] = fieldAt(gx0 + i * S * cell, gy0 + j * S * cell);
    const safe = 1.5 * S * cell;
    for (let j = 0; j < ny; j++) {
      const cj = Math.min(cy - 2, Math.floor(j / S)), fy = j / S - cj;
      for (let i = 0; i < nx; i++) {
        const ci = Math.min(cx - 2, Math.floor(i / S)), fx = i / S - ci;
        const a = coarse[cj * cx + ci]!, b = coarse[cj * cx + ci + 1]!, c = coarse[(cj + 1) * cx + ci]!, d = coarse[(cj + 1) * cx + ci + 1]!;
        const far = (a > safe && b > safe && c > safe && d > safe) || (a < -safe && b < -safe && c < -safe && d < -safe);
        field[j * nx + i] = far ? a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy : fieldAt(gx0 + i * cell, gy0 + j * cell);
      }
    }

    const loops = contour(field, nx, ny, gx0, gy0, cell);
    // Fewer points (those straying less than a third of a cell) and smooth curves through them.
    const rings = simplify([loops.map((l) => [...l, l[0]!] as Ring)], cell * 0.25)[0] ?? [];
    const subpaths = orient(rings.map((r) => r.slice(0, -1) as Pair[])).map(smooth);
    const front = solids[solids.length - 1]!.shapes;
    const from = front.find((s) => s.subpaths.some((sp) => sp.closed)) ?? front[0]!;
    const shapes: Shape[] = subpaths.length ? [{ ...from, subpaths, clone: 0 }] : [];
    return { viewBox: geo.viewBox, shapes: [...shapes, ...lines] };
  },
});

/** Smooth (polynomial) union: the same as min if a and b differ by more than k. */
function smin(a: number, b: number, k: number): number {
  if (!isFinite(a)) return b;
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Distance to the rings, negative inside (even-odd between them). */
function signedDistance(x: number, y: number, rings: Ring[]): number {
  let best = Infinity;
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ax, ay] = r[j]!, [bx, by] = r[i]!;
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
      const ex = bx - ax, ey = by - ay;
      const len2 = ex * ex + ey * ey;
      const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / len2)) : 0;
      const d = (x - ax - t * ex) ** 2 + (y - ay - t * ey) ** 2;
      if (d < best) best = d;
    }
  }
  const d = Math.sqrt(best);
  return inside ? -d : d;
}

/** Marching squares: the contours where the field crosses 0, as rings (without repeating the first point). */
function contour(f: Float64Array, nx: number, ny: number, ox: number, oy: number, cell: number): Pair[][] {
  const at = (i: number, j: number) => f[j * nx + i]!;
  // Crossing point on each edge, by its key: "h,i,j" between (i,j)-(i+1,j); "v,i,j" between (i,j)-(i,j+1).
  const point = (key: string): Pair => {
    const [kind, si, sj] = key.split(',');
    const i = Number(si), j = Number(sj);
    const a = at(i, j), b = kind === 'h' ? at(i + 1, j) : at(i, j + 1);
    const t = a === b ? 0.5 : a / (a - b);
    return kind === 'h' ? [ox + (i + t) * cell, oy + j * cell] : [ox + i * cell, oy + (j + t) * cell];
  };
  const links = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    links.set(a, [...(links.get(a) ?? []), b]);
    links.set(b, [...(links.get(b) ?? []), a]);
  };
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const v = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      const c = (v[0]! < 0 ? 1 : 0) | (v[1]! < 0 ? 2 : 0) | (v[2]! < 0 ? 4 : 0) | (v[3]! < 0 ? 8 : 0);
      if (c === 0 || c === 15) continue;
      const top = `h,${i},${j}`, right = `v,${i + 1},${j}`, bottom = `h,${i},${j + 1}`, left = `v,${i},${j}`;
      const centre = (v[0]! + v[1]! + v[2]! + v[3]!) / 4 < 0;
      switch (c) {
        case 1: case 14: link(left, top); break;
        case 2: case 13: link(top, right); break;
        case 3: case 12: link(left, right); break;
        case 4: case 11: link(right, bottom); break;
        case 6: case 9: link(top, bottom); break;
        case 7: case 8: link(left, bottom); break;
        // Opposite corners: the centre decides whether they join.
        case 5: if (centre) { link(left, bottom); link(top, right); } else { link(left, top); link(right, bottom); } break;
        case 10: if (centre) { link(left, top); link(right, bottom); } else { link(left, bottom); link(top, right); } break;
      }
    }
  }
  const used = new Set<string>();
  const loops: Pair[][] = [];
  for (const startKey of links.keys()) {
    if (used.has(startKey)) continue;
    const loop: Pair[] = [];
    let prev = '', cur = startKey;
    while (cur && !used.has(cur)) {
      used.add(cur);
      loop.push(point(cur));
      const next = (links.get(cur) ?? []).find((n) => n !== prev && !used.has(n));
      prev = cur;
      cur = next ?? '';
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** Outer ones one way; holes (inside an odd number of others) the other way. */
function orient(loops: Pair[][]): Pair[][] {
  const area = (l: Pair[]) => l.reduce((s, q, i) => { const r = l[(i + 1) % l.length]!; return s + q[0] * r[1] - r[0] * q[1]; }, 0) / 2;
  const inLoop = ([x, y]: Pair, l: Pair[]) => {
    let hit = false;
    for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
      const [xi, yi] = l[i]!, [xj, yj] = l[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  return loops.map((l, n) => {
    const depth = loops.filter((o, m) => m !== n && inLoop(l[0]!, o)).length;
    const wantPositive = depth % 2 === 0;
    return area(l) > 0 === wantPositive ? l : [...l].reverse();
  });
}

/** Ring of points → a smooth closed curve (Catmull-Rom turned into cubics). */
function smooth(pts: Pair[]): SubPath {
  const n = pts.length;
  const P = (i: number) => pts[((i % n) + n) % n]!;
  const segs: Cubic[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1: Vec2 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Vec2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    segs.push({ c1, c2, p: [p2[0], p2[1]] });
  }
  return { start: [pts[0]![0], pts[0]![1]], segs, closed: true };
}
