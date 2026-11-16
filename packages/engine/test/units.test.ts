import { describe, expect, it } from 'vitest';
import { bounds, builtins, buildShape, convertUnit, createEngine, parsePercent, shapeRegistry, validateScene, type SceneV1 } from '../src';
import { lerpValue } from '../src/animation';

const rect = shapeRegistry.get('rectangle')!.params;
const doc = { width: 1000, height: 400 };
const scene = (params: Record<string, unknown>, document: SceneV1['document'] = doc): SceneV1 => ({
  version: 1, document, objects: [{ kind: 'shape', id: 'r', name: 'r', shape: 'rectangle', params, stack: [] }],
} as SceneV1);
const boxOf = (s: SceneV1) => createEngine(builtins).evaluateDocument(s).nodes.get('r')!.bounds;

describe('percent units', () => {
  it('reads percentages, nothing else', () => {
    expect(parsePercent('50%')).toBe(50);
    expect(parsePercent(' 12.5 % ')).toBe(12.5);
    expect(parsePercent('50')).toBeNull();
    expect(parsePercent(50)).toBeNull();
  });

  it('sizes a shape against the document', () => {
    const b = boxOf(scene({ width: '50%', height: '25%' }));
    expect(b.width).toBeCloseTo(500);
    expect(b.height).toBeCloseTo(100);
  });

  it('follows the document when it changes', () => {
    const e = createEngine(builtins);
    const a = e.evaluateDocument(scene({ width: '50%' })).nodes.get('r')!.bounds.width;
    const b = e.evaluateDocument(scene({ width: '50%' }, { width: 600, height: 400 })).nodes.get('r')!.bounds.width;
    expect(a).toBeCloseTo(500);
    expect(b).toBeCloseTo(300);
  });

  it('measures a corner radius on half the shorter side: 100% is a pill', () => {
    const pill = buildShape('rectangle', { width: 200, height: 80, radius: '100%' });
    const square = buildShape('rectangle', { width: 200, height: 80, radius: 40 });
    expect(JSON.stringify(pill)).toBe(JSON.stringify(square));
    // On a percentage-sized rectangle too (the radius uses the resolved width and height).
    const sized = buildShape('rectangle', { width: '20%', height: '20%', radius: '100%' }, { document: { width: 1000, height: 400 } });
    expect(bounds(sized).width).toBeCloseTo(200);
  });

  it('converts between px and % without moving the drawing', () => {
    expect(convertUnit(rect.width!, 250, '%', {}, { document: doc })).toBe('25%');
    expect(convertUnit(rect.width!, '25%', 'px', {}, { document: doc })).toBe(250);
    expect(convertUnit(rect.radius!, 20, '%', { width: 200, height: 80 })).toBe('50%');
  });

  it('interpolates two percentage keys as percentages', () => {
    expect(lerpValue('20%', '80%', 0.5)).toBe('50%');
  });

  it('validates: a percentage only where it is accepted, and a real one', () => {
    expect(validateScene(scene({ width: '50%', radius: '10%' })).warnings).toEqual([]);
    expect(validateScene(scene({ width: 'wide' })).warnings.join()).toContain('must be a number or a percentage');
    const star = { version: 1, objects: [{ kind: 'shape', id: 's', name: 's', shape: 'star', params: { radius: '50%' }, stack: [] }] } as SceneV1;
    expect(validateScene(star).warnings.join()).toContain('does not accept percentages');
  });
});
