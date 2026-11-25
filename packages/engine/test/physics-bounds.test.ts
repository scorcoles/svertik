// physicsBounds: the document's edges are walls for every Physics; Adapt gives the document the viewport's shape.
import { describe, expect, it } from 'vitest';
import { adaptedDocument, bounds, builtins, createEngine, sampleScene, validateScene, type SceneV1 } from '../src';

const scene = (extra: Partial<SceneV1> = {}, groupAt: [number, number] = [0, 0]): SceneV1 => ({
  version: 1,
  document: { width: 400, height: 300 },
  animation: { duration: 4, fps: 30, tracks: [] },
  ...extra,
  objects: [{
    kind: 'group', id: 'g', name: 'World', transform: { x: groupAt[0], y: groupAt[1] },
    stack: [{ id: 'ph', type: 'physics', params: { time: { $expr: 'scene.time', fallback: 0 }, acceleration: [300, 1500], bounce: 0.2 } }],
    children: [{ kind: 'shape', id: 'ball', name: 'Ball', shape: 'ellipse', params: { width: 40, height: 40 }, transform: { x: -groupAt[0], y: -groupAt[1] }, stack: [] }],
  }],
} as SceneV1);
const ballAt = (s: SceneV1, t: number) => bounds(createEngine(builtins).evaluateDocument({ ...sampleScene(s, t), at: t }).geometry);

describe('physicsBounds', () => {
  it('keeps a falling body inside the document', () => {
    const b = ballAt(scene({ physicsBounds: true }), 3);
    expect(b.y + b.height).toBeLessThanOrEqual(150 + 4);
    expect(b.y + b.height).toBeGreaterThan(150 - 10);
    expect(b.x + b.width).toBeLessThanOrEqual(200 + 4);
  });

  it('without it, the body leaves', () => {
    expect(ballAt(scene(), 3).y).toBeGreaterThan(400);
  });

  it('holds the walls at the document edges when the Physics group is moved', () => {
    const b = ballAt(scene({ physicsBounds: true }, [120, -60]), 3);
    expect(b.y + b.height).toBeLessThanOrEqual(150 + 4);
    expect(b.y + b.height).toBeGreaterThan(150 - 10);
  });

  it('follows the document (an adapted one) when it changes', () => {
    const b = ballAt(scene({ physicsBounds: true, document: { width: 800, height: 600 } }), 3);
    expect(b.y + b.height).toBeGreaterThan(300 - 10);
    expect(b.y + b.height).toBeLessThanOrEqual(300 + 4);
  });

  it('validates its flags', () => {
    expect(validateScene({ ...scene(), physicsBounds: 'yes' }).errors).toContain('physicsBounds must be true or false');
    expect(validateScene({ ...scene(), fullViewport: 'adapt', adaptContent: false }).errors).toEqual([]);
  });
});

describe('adaptedDocument', () => {
  const doc = { width: 1400, height: 900, x: 10 };
  it('scales the content to fit (the default): the document grows on the spare axis', () => {
    // 1920 × 1080: the height limits (× 1.2), so the document is 1600 × 900 around the same centre.
    expect(adaptedDocument({ document: doc }, 1920, 1080)).toEqual({ width: 1600, height: 900, x: 10 });
  });
  it('keeps the content at its size without adaptContent: the document is the viewport, in px', () => {
    expect(adaptedDocument({ document: doc, adaptContent: false }, 1920, 1080)).toEqual({ width: 1920, height: 1080, x: 10 });
  });
  it('gives null without a document or a size', () => {
    expect(adaptedDocument({}, 1920, 1080)).toBeNull();
    expect(adaptedDocument({ document: doc }, 0, 1080)).toBeNull();
  });
});
