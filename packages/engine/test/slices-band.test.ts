import { describe, expect, it } from 'vitest';
import { clipToBand } from '../src/modifiers/glitch';
import { intersection, type MultiPolygon, type Pair } from '../src/polygon';

// Area of a multipolygon (outer rings minus holes), whatever the orientation of each ring.
const ringArea = (r: Pair[]) => {
  let a = 0;
  for (let i = 0; i < r.length - 1; i++) a += r[i]![0] * r[i + 1]![1] - r[i + 1]![0] * r[i]![1];
  return Math.abs(a) / 2;
};
const area = (m: MultiPolygon) => m.reduce((s, poly) => s + ringArea(poly[0]!) - poly.slice(1).reduce((h, r) => h + ringArea(r), 0), 0);

const close = (pts: Pair[]): Pair[] => [...pts, pts[0]!];
const circle = (cx: number, cy: number, r: number, n = 48): Pair[] =>
  close(Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)] as Pair));
// A U: concave, so a band through its arms cuts it into two pieces.
const u: Pair[] = close([[0, 0], [30, 0], [30, 100], [20, 100], [20, 10], [10, 10], [10, 100], [0, 100]]);
const square = (x: number, y: number, s: number): Pair[] => close([[x, y], [x + s, y], [x + s, y + s], [x, y + s]]);

const band = (y0: number, y1: number): MultiPolygon => [[close([[-1000, y0], [1000, y0], [1000, y1], [-1000, y1]])]];

describe('Slices band clip', () => {
  const cases: [string, MultiPolygon][] = [
    ['convex', [[circle(50, 50, 40)]]],
    ['concave', [[u]]],
    ['with a hole', [[square(0, 0, 100), square(30, 30, 40)]]],
  ];
  for (const [name, poly] of cases) {
    it(`keeps the exact area of a ${name} region`, () => {
      for (const [y0, y1] of [[-10, 20], [15, 45], [35, 65], [90, 200], [0, 100]] as const) {
        expect(area(clipToBand(poly, y0, y1))).toBeCloseTo(area(intersection(poly, band(y0, y1))), 6);
      }
    });
  }

  it('drops what falls outside the band', () => {
    expect(clipToBand([[square(0, 0, 10)]], 20, 30)).toEqual([]);
  });
});

describe('Scanlines as bands', () => {
  it('removes the same area as subtracting the lines', async () => {
    const { builtins, createEngine } = await import('../src');
    const { difference } = await import('../src/polygon');
    const scene = {
      version: 1 as const,
      objects: [{ kind: 'shape' as const, id: 'c', name: 'c', shape: 'ellipse', params: { width: 200, height: 160, fillColor: '#000000' }, stack: [{ id: 's', type: 'scanlines', params: { count: 20, width: 2 } }] }],
    };
    const svg = createEngine(builtins).toSVG(scene);
    expect(svg).toContain('<path');
    // The same cut by hand: the ellipse's region minus full-width lines.
    const poly: MultiPolygon = [[circle(0, 0, 50, 96)]];
    const lines: MultiPolygon = Array.from({ length: 10 }, (_, i) => [close([[-60, -50 + i * 10], [60, -50 + i * 10], [60, -48 + i * 10], [-60, -48 + i * 10]])]);
    const bands: MultiPolygon = [];
    let from = -51;
    for (let i = 0; i < 10; i++) { const y = -50 + i * 10; bands.push(...clipToBand(poly, from, y)); from = y + 2; }
    bands.push(...clipToBand(poly, from, 51));
    expect(area(bands)).toBeCloseTo(area(difference(poly, lines)), 6);
  });
});
