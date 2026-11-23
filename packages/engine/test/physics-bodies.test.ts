// Gestures name one body: a letter of a word, not the whole word.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bounds, builtins, createEngine, registerFont, sampleScene, type SceneV1, type Shape } from '../src';

const woff = readFileSync(resolve(__dirname, '../../ui/node_modules/@fontsource/commit-mono/files/commit-mono-latin-400-normal.woff'));
await registerFont('Commit Mono', woff.buffer.slice(woff.byteOffset, woff.byteOffset + woff.byteLength));

const world = (events: Partial<SceneV1> = {}): SceneV1 => ({
  version: 1, animation: { duration: 4, fps: 30, tracks: [] }, ...events,
  objects: [{
    kind: 'group', id: 'g', name: 'World',
    stack: [{ id: 'ph', type: 'physics', params: { time: { $expr: 'scene.time', fallback: 0 }, collisions: false, poke: 300, burst: 4 } }],
    children: [{ kind: 'shape', id: 'word', name: 'Word', shape: 'text', params: { font: 'Commit Mono', text: 'AB', size: 120, tracking: 400 }, stack: [] }],
  }],
});
const at = (s: SceneV1, t: number) => createEngine(builtins).evaluateDocument({ ...sampleScene(s, t), at: t }).geometry.shapes;
const centreOf = (shapes: Shape[]) => { const b = bounds({ viewBox: [0, 0, 0, 0], shapes }); return [b.x + b.width / 2, b.y + b.height / 2]; };

describe('gestures on one letter', () => {
  const rest = at(world(), 0.5);
  const bodies = [...new Set(rest.map((s) => s.body!))];
  const [a, b] = bodies as [string, string];

  it('each letter is a body with its own identity', () => {
    expect(bodies).toHaveLength(2);
  });

  it('a click on B pushes B only', () => {
    const shapes = at(world({ pokes: [{ at: 1, node: 'word', body: b, dir: [0, 1] }] }), 2);
    const A = centreOf(shapes.filter((s) => s.body === a)), B = centreOf(shapes.filter((s) => s.body === b));
    expect(A).toEqual(centreOf(rest.filter((s) => s.body === a)));
    expect(B[1]! - centreOf(rest.filter((s) => s.body === b))[1]!).toBeGreaterThan(250);
  });

  it('a double-click on A breaks A only', () => {
    const shapes = at(world({ bursts: [{ at: 1, node: 'word', body: a }] }), 1.5);
    expect(new Set(shapes.filter((s) => s.burstSpeed).map((s) => s.body)).size).toBeGreaterThanOrEqual(3);
    expect(shapes.filter((s) => s.body === b)).toHaveLength(rest.filter((s) => s.body === b).length);
    expect(centreOf(shapes.filter((s) => s.body === b))).toEqual(centreOf(rest.filter((s) => s.body === b)));
  });
});
