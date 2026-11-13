// Las escenas del corpus.
//
// Hay de dos clases: las reales (las demos del proyecto y las recetas de la documentación) y
// las sintéticas, que montan el caso que hace doler a un efecto concreto. Las sintéticas son
// las que permiten comparar dos versiones del motor en un efecto concreto: si el efecto
// `metaball` cambia, el caso `heavy-metaball` lo enseña.
//
// Las escenas de aquí son copias (no enlaces): el corpus es una referencia estable y no debe
// cambiar cuando cambien las demos.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SceneV2 } from '../../src/scene';
import type { CorpusCase } from './run';

const here = dirname(fileURLToPath(import.meta.url));
const read = (file: string): SceneV2 => {
  const raw = JSON.parse(readFileSync(resolve(here, file), 'utf8')) as unknown;
  const data = raw as { svertik?: string; scene?: unknown };
  return (data.svertik === 'project' ? data.scene : raw) as SceneV2;
};

const recipes = read('recipes.json') as unknown as SceneV2[];

/** Un grupo con `n` elipses y un efecto encima: el caso que hace doler a ese efecto. */
function heavy(effect: string, n = 6, extra: Record<string, unknown> = {}): SceneV2 {
  const children = Array.from({ length: n }, (_, i) => ({
    kind: 'shape' as const,
    id: `k${i}`,
    name: `k${i}`,
    shape: 'ellipse',
    params: { rx: 60, ry: 40, x: (i % 3) * 40, y: Math.floor(i / 3) * 35, fillColor: '#09fdd1' },
    stack: [],
  }));
  return {
    version: 2,
    objects: [{ kind: 'group', id: 'g', name: 'g', children, stack: [{ id: 'fx', type: effect, params: extra }] }],
    animation: { duration: 2, loop: true, tracks: [] },
  } as SceneV2;
}

/** Una escena con un objeto y una pila de efectos, para medir cada efecto por separado. */
function solo(effect: string, params: Record<string, unknown> = {}): SceneV2 {
  return {
    version: 2,
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
  } as SceneV2;
}

/** Todos los casos del corpus. */
export const cases: CorpusCase[] = [
  // Las escenas reales
  { id: 'motion-demo', scene: read('scenes/motion-demo.json'), frames: 24, laps: 2 },
  { id: 'biosphere', scene: read('scenes/biosphere.json'), frames: 24, laps: 2 },
  ...recipes.map((scene, i) => ({ id: `recipe-${i + 1}`, scene, frames: 12, laps: 2 })),

  // Los efectos que más cuestan, en scenes sintéticas
  { id: 'heavy-metaball', scene: heavy('metaball', 8), frames: 12, laps: 2 },
  { id: 'heavy-damage', scene: heavy('damage', 8), frames: 12, laps: 2 },
  { id: 'heavy-crack', scene: heavy('crack', 8), frames: 12, laps: 2 },
  { id: 'heavy-boolean', scene: heavy('boolean', 8), frames: 12, laps: 2 },
  { id: 'heavy-mosaic', scene: heavy('mosaic', 8), frames: 12, laps: 2 },
  { id: 'heavy-fractal', scene: heavy('fractal', 8), frames: 12, laps: 2 },
  { id: 'heavy-halftone', scene: heavy('halftone', 8), frames: 12, laps: 2 },
  { id: 'heavy-clone', scene: heavy('clone', 8), frames: 12, laps: 2 },
  { id: 'heavy-pixelate', scene: heavy('pixelate', 8), frames: 12, laps: 2 },

  // Un efecto suelto, para ver cuánto cuesta cada uno
  { id: 'solo-wave', scene: solo('wave'), frames: 12, laps: 2 },
  { id: 'solo-twist', scene: solo('twist'), frames: 12, laps: 2 },
  { id: 'solo-spherize', scene: solo('spherize'), frames: 12, laps: 2 },
  { id: 'solo-noise', scene: solo('noise'), frames: 12, laps: 2 },
  { id: 'solo-halftone', scene: solo('halftone'), frames: 12, laps: 2 },
  { id: 'solo-fractal', scene: solo('fractal'), frames: 12, laps: 2 },
  { id: 'solo-metaball', scene: solo('metaball'), frames: 12, laps: 2 },
  { id: 'solo-step', scene: solo('step'), frames: 12, laps: 2 },
];

/** Los casos que necesitan una fuente (el texto de las recetas). */
export const needsFont = (c: CorpusCase): boolean =>
  JSON.stringify(c.scene).includes('"text"');
