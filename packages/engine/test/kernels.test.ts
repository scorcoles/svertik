// The kernels (Rust, WebAssembly): the same drawing as the TypeScript version, but sooner.
//
// The gate is the only thing that matters: with the kernel and without it, the SVG is exactly the
// same, byte by byte. If the module is not compiled, the tests are skipped (the engine still works).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { builtins, createEngine } from '../src';
import { sampleScene } from '../src/animation';
import { initKernels, kernels, setKernels } from '../src/kernels';
import type { SceneV1 } from '../src/scene';

// The tests run under vite: the file is read from disk and given to the kernel loader.
const here = dirname(fileURLToPath(import.meta.url));
const wasm = resolve(here, '../src/kernels/svertik_kernels.wasm');
const there = existsSync(wasm);
const bytes = there ? readFileSync(wasm) : null;

/** The blobs that melt, in a group (so the effect sees several elements). */
const blobs = (): SceneV1 => ({
  version: 1,
  objects: [
    {
      kind: 'group',
      id: 'g',
      name: 'g',
      stack: [{ id: 'mb', type: 'metaball', params: { reach: 40, grow: 4, quality: 120 } }],
      children: [
        { kind: 'shape', id: 'a', name: 'a', shape: 'ellipse', params: { width: 60, height: 60, fillColor: '#09fdd1' }, stack: [], transform: { x: -20, y: 0 } },
        { kind: 'shape', id: 'b', name: 'b', shape: 'star', params: { radius: 34, points: 5, fillColor: '#ff2a5f' }, stack: [], transform: { x: 26, y: 8 } },
      ],
    },
  ],
});

/** The SVG of a scene, frame by frame like the player (the engine is not idempotent). */
const draw = (scene: SceneV1, frames = 12): string => {
  const engine = createEngine(builtins);
  let svg = '';
  for (let i = 0; i < frames; i++) svg = engine.toSVG(sampleScene(scene, i / 30));
  return svg;
};

const load = async (): Promise<void> => {
  setKernels(null);
  expect(await initKernels(bytes!)).not.toBeNull();
};

afterEach(() => setKernels(null));

describe.skipIf(!there)('kernels', () => {
  it('the module loads and exposes the metaball kernel', async () => {
    await load();
    expect(kernels()).not.toBeNull();
  });

  it('the metaball gives the same SVG with the kernel and without it', async () => {
    setKernels(null);
    const without = draw(blobs());
    await load();
    expect(draw(blobs())).toBe(without);
  });

  it('the rest of the scene does not notice the kernel', async () => {
    // The random seed is per scene, and the kernel must not change the drawing of anything else.
    const scene = blobs();
    scene.objects.push({
      kind: 'shape',
      id: 's',
      name: 's',
      shape: 'ellipse',
      params: { width: 20, height: 20 },
      stack: [{ id: 'gr', type: 'grain', params: { amount: 0.4 } }],
    });
    setKernels(null);
    const without = draw(scene);
    await load();
    expect(draw(scene)).toBe(without);
  });

  it('the kernel returns outlines', async () => {
    await load();
    const loops = kernels()!.metaball({
      reach: 40,
      grow: 4,
      quality: 120,
      box: [-60, -50, 60, 50],
      shapes: [
        {
          rings: [Array.from({ length: 128 }, (_, i) => [Math.cos((i / 128) * Math.PI * 2) * 30, Math.sin((i / 128) * Math.PI * 2) * 30]).flat()],
          box: [-30, -30, 30, 30],
        },
      ],
    });
    expect(loops.length).toBeGreaterThan(0);
    expect(loops[0]!.length).toBeGreaterThan(16);
  });
});
