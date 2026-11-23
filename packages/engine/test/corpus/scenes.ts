// The corpus scenes.
//
// Two kinds: real ones (the project demos and the doc recipes) and synthetic ones, built
// around the case that hurts a given effect. The synthetic ones let two engine versions be
// compared on one effect: if the `metaball` effect changes, the `heavy-metaball` case
// shows it.
//
// The scenes here are copies (not links): the corpus is a stable reference and must not
// change when the demos do.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SceneV1 } from '../../src/scene';
import type { CorpusCase } from './run';

const here = dirname(fileURLToPath(import.meta.url));
const read = (file: string): SceneV1 => {
  const raw = JSON.parse(readFileSync(resolve(here, file), 'utf8')) as unknown;
  const data = raw as { svertik?: string; scene?: unknown };
  return (data.svertik === 'project' ? data.scene : raw) as SceneV1;
};

const recipes = read('recipes.json') as unknown as SceneV1[];

/** A group of `n` ellipses with one effect on it: the case that hurts that effect. */
function heavy(effect: string, n = 6, extra: Record<string, unknown> = {}): SceneV1 {
  const children = Array.from({ length: n }, (_, i) => ({
    kind: 'shape' as const,
    id: `k${i}`,
    name: `k${i}`,
    shape: 'ellipse',
    params: { rx: 60, ry: 40, x: (i % 3) * 40, y: Math.floor(i / 3) * 35, fillColor: '#09fdd1' },
    stack: [],
  }));
  return {
    version: 1,
    objects: [{ kind: 'group', id: 'g', name: 'g', children, stack: [{ id: 'fx', type: effect, params: extra }] }],
    animation: { duration: 2, loop: true, tracks: [] },
  } as SceneV1;
}

/** A scene with one object and an effect stack, to measure each effect on its own. */
function solo(effect: string, params: Record<string, unknown> = {}): SceneV1 {
  return {
    version: 1,
    objects: [
      {
        kind: 'shape',
        id: 'o',
        name: 'o',
        shape: 'star',
        params: { radius: 90, points: 7, fillColor: '#09fdd1' },
        stack: [{ id: 'fx', type: effect, params }],
      },
    ],
    animation: { duration: 2, loop: true, tracks: [] },
  } as SceneV1;
}

/** Every corpus case. */
export const cases: CorpusCase[] = [
  // The real scenes
  ...recipes.map((scene, i) => ({ id: `recipe-${i + 1}`, scene, frames: 12, laps: 2 })),

  // The costliest effects, in synthetic scenes
  { id: 'heavy-metaball', scene: heavy('metaball', 8), frames: 12, laps: 2 },
  { id: 'heavy-damage', scene: heavy('damage', 8), frames: 12, laps: 2 },
  { id: 'heavy-crack', scene: heavy('crack', 8), frames: 12, laps: 2 },
  { id: 'heavy-boolean', scene: heavy('boolean', 8), frames: 12, laps: 2 },
  { id: 'heavy-mosaic', scene: heavy('mosaic', 8), frames: 12, laps: 2 },
  { id: 'heavy-fractal', scene: heavy('fractal', 8), frames: 12, laps: 2 },
  { id: 'heavy-halftone', scene: heavy('halftone', 8), frames: 12, laps: 2 },
  { id: 'heavy-clone', scene: heavy('clone', 8), frames: 12, laps: 2 },
  { id: 'heavy-pixelate', scene: heavy('pixelate', 8), frames: 12, laps: 2 },

  // One effect alone, to see what each one costs
  { id: 'solo-wave', scene: solo('wave'), frames: 12, laps: 2 },
  { id: 'solo-twist', scene: solo('twist'), frames: 12, laps: 2 },
  { id: 'solo-spherize', scene: solo('spherize'), frames: 12, laps: 2 },
  { id: 'solo-noise', scene: solo('noise'), frames: 12, laps: 2 },
  { id: 'solo-halftone', scene: solo('halftone'), frames: 12, laps: 2 },
  { id: 'solo-fractal', scene: solo('fractal'), frames: 12, laps: 2 },
  { id: 'solo-metaball', scene: solo('metaball'), frames: 12, laps: 2 },
  { id: 'solo-step', scene: solo('step'), frames: 12, laps: 2 },
];

/** The cases that need a font (the recipes' text). */
export const needsFont = (c: CorpusCase): boolean =>
  JSON.stringify(c.scene).includes('"text"');
