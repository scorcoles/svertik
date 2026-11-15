import { describe, expect, it } from 'vitest';
import { bounds, buildShape, flatten, insidePolygons, shapes, validateScene } from '../src';

const area = (size: number, width: number) => {
  const points = flatten(buildShape('cross', { size, width }).shapes[0]!.subpaths[0]!, 1);
  return Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]!; return sum + p[0] * q[1] - p[1] * q[0]; }, 0)) / 2;
};

describe('Cross primitive', () => {
  it('has a closed plus outline, centred on the origin, with independent arm width', () => {
    const geo = buildShape('cross', { size: 100, width: 20 });
    expect(bounds(geo)).toEqual({ x: -50, y: -50, width: 100, height: 100 });
    expect(geo.shapes[0]!.subpaths[0]!.closed).toBe(true);
    const polygons = geo.shapes[0]!.subpaths.map((p) => flatten(p, 1));
    expect(insidePolygons(polygons, [0, 40])).toBe(true);
    expect(insidePolygons(polygons, [40, 0])).toBe(true);
    expect(insidePolygons(polygons, [40, 40])).toBe(false);
    expect(area(100, 20)).toBeCloseTo(3600);
    expect(area(100, 40)).toBeCloseTo(6400);
  });
  it('clamps overly wide arms and sits immediately above Pawn', () => {
    expect(area(100, 200)).toBeCloseTo(10000);
    expect(shapes.at(-2)!.type).toBe('cross');
    expect(shapes.at(-1)!.type).toBe('pawn');
    expect(validateScene({ version: 2, objects: [{ kind: 'shape', id: 'c', name: 'Cross', shape: 'cross', params: { size: 18, width: 4 }, stack: [] }] })).toEqual({ errors: [], warnings: [] });
  });
});
