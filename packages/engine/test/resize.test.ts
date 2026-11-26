import { describe, expect, it } from 'vitest';
import { builtins, createEngine, placementOf, resizeOffset, resizeShapeParams, type SceneV1 } from '../src/index';

const engine = createEngine(builtins);
const boxOf = (scene: SceneV1) => engine.evaluateDocument(scene).nodes.get('s')!.box;
const close = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => {
  for (const k of ['x', 'y', 'width', 'height'] as const) expect(a[k]).toBeCloseTo(b[k], 3);
};
const sceneOf = (shape: string, params: Record<string, unknown>, transform: Record<string, unknown>): SceneV1 =>
  ({ version: 1, objects: [{ kind: 'shape', id: 's', name: 'S', shape, params, transform, stack: [] }] }) as SceneV1;

/** The shape resized by its values, moved so `fixed` (local) stays put. */
function byValues(shape: string, params: Record<string, unknown>, transform: Record<string, unknown>, sx: number, sy: number, fixed?: (b: { x: number; y: number; width: number; height: number }) => [number, number]) {
  const before = sceneOf(shape, params, transform);
  const info = engine.evaluateDocument(before).nodes.get('s')!;
  const p = placementOf(before.objects[0]!);
  const pivot = info.pivot!, origin = info.origin!;
  const [dx, dy] = resizeOffset(p, pivot, origin, fixed ? fixed(info.bounds) : pivot, sx, sy);
  return sceneOf(shape, resizeShapeParams(shape, params, sx, sy)!, { ...transform, x: p.x + dx, y: p.y + dy });
}

describe('resizeShapeParams', () => {
  it('scales size values, leaves formulas, stroke and the rest', () => {
    expect(resizeShapeParams('donut', { radius: 100, innerRadius: { $expr: 'this.radius - 50', fallback: 50 }, strokeWidth: 4 }, 2, 2))
      .toEqual({ radius: 200, innerRadius: { $expr: 'this.radius - 50', fallback: 50 }, strokeWidth: 4 });
  });
  it('uses defaults for values left unset', () => {
    expect(resizeShapeParams('donut', {}, 2, 2)).toEqual({ radius: 160, innerRadius: 90 });
  });
  it('refuses a non-uniform resize of a uniform-only shape', () => {
    expect(resizeShapeParams('donut', {}, 2, 1)).toBeNull();
    expect(resizeShapeParams('rectangle', { width: 100, height: 50, radius: 10 }, 2, 3)).toEqual({ width: 200, height: 150, radius: 20 });
  });
});

describe('resizeOffset', () => {
  it('a corner resize looks like scaling around the pivot (rotated, off-centre pivot)', () => {
    const t = { x: 30, y: -20, rotation: 30, scale: 1.5, pivot: [0, 0] };
    const scaled = boxOf(sceneOf('donut', { radius: 100, innerRadius: 40 }, { ...t, scale: 1.5 * 1.7 }));
    close(boxOf(byValues('donut', { radius: 100, innerRadius: 40 }, t, 1.7, 1.7)), scaled);
  });
  it('an edge stretch keeps the opposite edge (rectangle, rotated)', () => {
    const t = { x: 10, y: 5, rotation: 0, pivot: [0.2, 0.8] };
    const stretched = boxOf(byValues('rectangle', { width: 100, height: 60 }, t, 1.5, 1, (b) => [b.x, b.y]));
    const before = boxOf(sceneOf('rectangle', { width: 100, height: 60 }, t));
    expect(stretched.x).toBeCloseTo(before.x, 3);
    expect(stretched.width).toBeCloseTo(before.width * 1.5, 3);
    expect(stretched.height).toBeCloseTo(before.height, 3);
  });
  it('works on a path with its own origin', () => {
    const contours = [{ closed: true, points: [{ point: [10, 0], in: [0, 0], out: [0, 0], mode: 'corner' }, { point: [90, 20], in: [0, 0], out: [0, 0], mode: 'corner' }, { point: [40, 70], in: [0, 0], out: [0, 0], mode: 'corner' }] }];
    const t = { x: 0, y: 0 };
    const scaled = boxOf(sceneOf('path', { contours }, { ...t, scale: 2 }));
    close(boxOf(byValues('path', { contours }, t, 2, 2)), scaled);
    close(boxOf(byValues('path', { contours }, { ...t, pivot: [0.2, 0.9] }, 2, 2)), boxOf(sceneOf('path', { contours }, { ...t, pivot: [0.2, 0.9], scale: 2 })));
  });
  it('works on text anchored left', () => {
    const t = { x: 40, y: 10, rotation: -20 };
    const params = { text: 'Hola', anchor: 'left', size: 40 };
    close(boxOf(byValues('text', params, t, 1.5, 1.5)), boxOf(sceneOf('text', params, { ...t, scale: 1.5 })));
  });
});
