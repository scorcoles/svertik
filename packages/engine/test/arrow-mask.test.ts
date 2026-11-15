import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bounds, buildShape, builtins, createEngine, validateScene, type SceneV1 } from '../src';

const engine = createEngine(builtins);

describe('Arrow', () => {
  for (const startHead of ['none', 'triangle', 'v', 'square', 'circle']) for (const endHead of ['none', 'triangle', 'v', 'square', 'circle']) {
    it(`${startHead}, ${endHead}: a closed, finite, seamless outline`, () => {
      const geo = buildShape('arrow', { startHead, endHead, length: 240, width: 20, headWidth: 3 });
      expect(geo.shapes).toHaveLength(1);
      expect(geo.shapes[0]!.subpaths).toHaveLength(1);
      const path = geo.shapes[0]!.subpaths[0]!;
      expect(path.closed).toBe(true);
      expect(path.segs.at(-1)!.p).toEqual(path.start);
      expect(JSON.stringify(geo)).not.toMatch(/NaN|Infinity/);
      const b = bounds(geo);
      expect(b.x).toBeCloseTo(-120);
      expect(b.width).toBeCloseTo(240, 1);
      expect(b.height).toBeCloseTo(startHead === 'none' && endHead === 'none' ? 20 : 60, 1);
    });
  }
  it('validates the animated proportion parameters', () => {
    const scene: SceneV1 = { version: 1, objects: [{ kind: 'shape', id: 'a', name: 'Arrow', shape: 'arrow', params: { startHead: 'circle', endHead: 'v', headLength: 0.3, headWidth: 4, notch: 0.6 }, stack: [] }] };
    expect(validateScene(scene)).toEqual({ errors: [], warnings: [] });
  });
});

const scene = (whole = true, invert = false): SceneV1 => ({ version: 1, objects: [
  { kind: 'shape', id: 'cross', name: 'Cross', shape: 'cross', params: { size: 20, width: 4 }, stack: [
    { id: 'mask', type: 'mask', params: { source: 'boundary', whole, invert } },
    { id: 'copies', type: 'clone', params: { mode: 'grid', columns: 3, rows: 1, spacing: [1.5, 1] } },
  ] },
  { kind: 'shape', id: 'boundary', name: 'Boundary', shape: 'rectangle', params: { width: 60, height: 30 }, visible: false, stack: [] },
] });

describe('Whole elements mask', () => {
  it('discards partial copies after the whole stack, retaining original complete geometry', () => {
    const doc = engine.evaluateDocument(scene());
    expect(doc.geometry.shapes).toHaveLength(1);
    expect(bounds(doc.geometry).width).toBe(20);
    expect(engine.toSVG(scene())).not.toContain('<mask');
    expect(validateScene(scene())).toEqual({ errors: [], warnings: [] });
  });
  it('preserves native clipping when off, and rejects partial copies when inverted', () => {
    expect(engine.evaluateDocument(scene(false)).geometry.shapes).toHaveLength(3);
    expect(engine.toSVG(scene(false))).toContain('<mask');
    expect(engine.evaluateDocument(scene(true, true)).geometry.shapes).toHaveLength(0);
  });
  it('updates when the hidden target moves, including cached evaluations', () => {
    const s = scene(); engine.evaluateDocument(s);
    s.objects[1]!.transform = { x: 30 };
    const result = engine.evaluateDocument(s).geometry;
    expect(result.shapes).toHaveLength(1);
    expect(bounds(result).x).toBe(20);
  });
  it('uses the actual outline instead of the bounding rectangle', () => {
    const s = scene(); s.objects[0]!.stack.splice(1);
    const boundary = s.objects[1]!;
    if (boundary.kind !== 'shape') throw new Error('shape');
    boundary.shape = 'cross'; boundary.params = { size: 22, width: 6 };
    // The corners of the source bounding box lie outside the mask, but the cross fits.
    expect(engine.evaluateDocument(s).geometry.shapes).toHaveLength(1);
  });
  it('honours holes and the full visible stroke', () => {
    const s = scene(); s.objects[0]!.stack.splice(1);
    s.objects[1] = { kind: 'object', id: 'boundary', name: 'Ring', visible: false,
      source: '<svg xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M-40 -40H40V40H-40Z M-5 -5H5V5H-5Z"/></svg>', stack: [] };
    expect(engine.evaluateDocument(s).geometry.shapes).toHaveLength(0);
    const stroked = scene(); stroked.objects[0]!.stack.splice(1);
    if (stroked.objects[0]!.kind === 'shape') stroked.objects[0]!.params = { size: 20, width: 4, stroke: true, strokeWidth: 12 };
    expect(engine.evaluateDocument(stroked).geometry.shapes).toHaveLength(0);
  });
  it('keeps compound clone copies indivisible', () => {
    const s = scene();
    s.objects[0] = { kind: 'group', id: 'cross', name: 'Compound', stack: s.objects[0]!.stack, children: [
      { kind: 'shape', id: 'one', name: 'One', shape: 'cross', params: { size: 20, width: 4 }, stack: [] },
      { kind: 'shape', id: 'two', name: 'Two', shape: 'cross', params: { size: 20, width: 4 }, transform: { y: 20 }, stack: [] },
    ] };
    expect(engine.evaluateDocument(s).geometry.shapes).toHaveLength(0);
  });

  it('handles projected crosses from the reported Step / Rotate 3D failure, including edge-on copies', () => {
    const source = JSON.parse(readFileSync('test/fixtures/mask-projected-crosses.json', 'utf8')) as SceneV1;
    expect(validateScene(source)).toEqual({ errors: [], warnings: [] });
    for (const y of [25, 26, 27, 26 - 1e-12, 26 + 1e-12]) {
      const s = structuredClone(source);
      s.objects[0]!.stack[1]!.children![0]!.params!.rotateY = y;
      const first = engine.evaluateDocument(s).geometry;
      expect(first.shapes.length).toBeGreaterThan(0);
      expect(first.shapes.length).toBeLessThan(288);
      expect(engine.evaluateDocument(s).geometry).toEqual(first);
    }
  });

});
