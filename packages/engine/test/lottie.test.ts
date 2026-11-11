import { describe, expect, it } from 'vitest';
import { builtins, createEngine, toLottie, type SceneV2 } from '../src';

const scene: SceneV2 = {
  version: 2,
  objects: [
    // It only moves and turns: one layer, with placement keys.
    { kind: 'shape', id: 'a', name: 'Mover', shape: 'star', params: {}, stack: [], transform: { x: 0 } },
    // Its shape changes (an animated effect): frame by frame. With a shadow: a warning.
    { kind: 'shape', id: 'b', name: 'Wavy', shape: 'rectangle', params: {}, stack: [{ id: 'w', type: 'wave', params: { amplitude: 0.1 } }, { id: 's', type: 'shadow' }], transform: { x: 300 } },
  ],
  animation: {
    duration: 1,
    fps: 10,
    tracks: [
      { id: 'p', node: 'a', on: 'node', param: 'x', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 1, value: 100 }] },
      { id: 'r', node: 'a', on: 'node', param: 'rotation', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 1, value: 90 }] },
      { id: 'ph', node: 'b', on: 'modifier', modifier: 'w', param: 'phase', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 1, value: 180 }] },
    ],
  },
  interactions: [{ id: 'i', node: 'a', trigger: 'hover', target: { node: 'a', on: 'node', param: 'scale' }, to: 1.2, duration: 0.3 }],
};

describe('Lottie', () => {
  const out = toLottie(createEngine(builtins), scene, { name: 'test' });
  const layers = out.data.layers as { nm: string; ip: number; op: number; ks: { p: { a: number; k: unknown[] } }; shapes: { it: { ty: string }[] }[] }[];

  it('header: frames, size and name', () => {
    expect(out.data).toMatchObject({ fr: 10, ip: 0, op: 10, nm: 'test' });
    expect(out.frames).toBe(10);
  });

  it('what only moves: one layer with position keys (those on a straight line, dropped)', () => {
    const mover = layers.filter((l) => l.nm === 'Mover');
    expect(mover).toHaveLength(1);
    expect(mover[0]!.ks.p.a).toBe(1);
    // Linear motion: the first and the last are enough.
    expect(mover[0]!.ks.p.k).toHaveLength(2);
    expect(mover[0]!.shapes[0]!.it.map((x) => x.ty)).toEqual(['sh', 'fl', 'tr']);
  });

  it('what changes shape: one layer per frame; and the warnings', () => {
    const wavy = layers.filter((l) => l.nm === 'Wavy');
    expect(wavy.length).toBeGreaterThan(1);
    // Together they cover the 10 frames, without gaps.
    expect(wavy.reduce((sum, l) => sum + l.op - l.ip, 0)).toBe(10);
    expect(out.warnings.join('\n')).toMatch(/Filters/);
    expect(out.warnings.join('\n')).toMatch(/Interactions/);
    expect(out.warnings.join('\n')).toMatch(/frame by frame.*Wavy/);
  });

  it('without animation: one frame, no weight warnings', () => {
    const still = toLottie(createEngine(builtins), { version: 2, objects: [scene.objects[0]!] });
    expect(still.data).toMatchObject({ op: 1 });
    expect(still.warnings).toEqual([]);
  });

  it('the pieces of an explosion (they only move, turn and shrink): one layer with its keys, not frame by frame', () => {
    const boom: SceneV2 = {
      version: 2,
      objects: [{ kind: 'shape', id: 'p', name: 'Pieces', shape: 'rectangle', params: {}, stack: [{ id: 'c', type: 'clone', params: { mode: 'grid', columns: 3, rows: 2 } }, { id: 'x', type: 'explosion', params: { amount: 0 } }] }],
      animation: { duration: 1, fps: 10, tracks: [{ id: 'a', node: 'p', on: 'modifier', modifier: 'x', param: 'amount', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 1, value: 1 }] }] },
    };
    const out = toLottie(createEngine(builtins), boom);
    const ls = out.data.layers as { shapes: { it: { ty: string; p?: { a: number } }[] }[] }[];
    expect(ls).toHaveLength(1);
    // Each piece, a group with its animated transform.
    expect(ls[0]!.shapes).toHaveLength(6);
    expect(ls[0]!.shapes.every((g) => g.it.at(-1)!.ty === 'tr' && g.it.at(-1)!.p!.a === 1)).toBe(true);
    expect(out.warnings).toEqual([]);
  });
});

describe('Lottie: what comes in from invisible', () => {
  it('a text (or piece) that appears: fill at 100 % and opacity animated from 0, with the keys at their time', () => {
    const fade: SceneV2 = {
      version: 2,
      objects: [{ kind: 'shape', id: 'r', name: 'Fade', shape: 'rectangle', params: {}, stack: [{ id: 'c', type: 'clone', params: { mode: 'grid', columns: 2, rows: 1 } }, { id: 'o', type: 'opacity', params: { opacity: 0 } }, { id: 'x', type: 'explosion', params: { amount: 0 } }] }],
      animation: {
        duration: 2,
        fps: 10,
        tracks: [
          { id: 'a', node: 'r', on: 'modifier', modifier: 'o', param: 'opacity', keys: [{ t: 0, value: 0 }, { t: 0.5, value: 1 }] },
          // The explosion starts halfway: its segment does not start at frame 0.
          { id: 'b', node: 'r', on: 'modifier', modifier: 'x', param: 'amount', keys: [{ t: 0, value: 0 }, { t: 1, value: 0, ease: 'linear' }, { t: 2, value: 1 }] },
        ],
      },
    };
    const ls = toLottie(createEngine(builtins), fade).data.layers as { ip: number; shapes: { it: { ty: string; o: { a: number; k: unknown } }[] }[] }[];
    // The one at the start (layers go front to back: the first is the last segment).
    const first = ls.find((l) => l.ip === 0)!;
    const fill = first.shapes[0]!.it.find((x) => x.ty === 'fl')!;
    expect(fill.o).toEqual({ a: 0, k: 100 });
    const tr = first.shapes[0]!.it.find((x) => x.ty === 'tr')! as unknown as { o: { a: number; k: { t: number; s: number[] }[] }; p: { k: { t: number }[] } };
    expect(tr.o.k[0]!.s[0]).toBe(0);
    // All the keys of each layer fall within its segment.
    for (const l of ls as unknown as { ip: number; op: number; shapes: { it: { ty: string; p?: { a: number; k: { t: number }[] } }[] }[] }[]) {
      for (const g of l.shapes) {
        const p = g.it.at(-1)!.p!;
        if (p.a === 1) for (const k of p.k) expect(k.t).toBeGreaterThanOrEqual(l.ip), expect(k.t).toBeLessThan(l.op);
      }
    }
  });
});
