// La puerta de conformidad del motor: el corpus no puede cambiar sin que alguien lo acepte.
//
// No decide si un cambio es bueno (eso es de quien lee el diff), pero sí obliga a que exista:
// si el motor cambia de salida, la prueba falla y hay que actualizar el dorado a propósito.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { builtins, createEngine } from '../src';
import { registerFont } from '../src/fonts';
import type { SceneV1 } from '../src/scene';
import { cases, needsFont } from './corpus/scenes';
import { keyOf, readGolden } from './corpus/golden';
import { runCorpus } from './corpus/run';

const here = dirname(fileURLToPath(import.meta.url));

/** La fuente de los textos (la que trae el proyecto). */
const fontFile = resolve(here, '../../ui/node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff');

beforeAll(async () => {
  if (cases.some(needsFont)) {
    const woff = readFileSync(fontFile);
    await registerFont('JetBrains Mono', woff.buffer.slice(woff.byteOffset, woff.byteOffset + woff.byteLength) as ArrayBuffer);
  }
}, 60_000);

describe('corpus', () => {
  // El corpus se reproduce una vez: es lento (cada escena, sus fotogramas).
  let results: ReturnType<typeof runCorpus>;

  beforeAll(() => {
    results = runCorpus(cases);
  }, 300_000);

  it('el motor dibuja lo mismo que cuando se fijó el dorado', () => {
    const golden = readGolden();
    const diffs: string[] = [];
    for (const r of results) {
      const expected = golden[r.id];
      if (!expected) {
        diffs.push(`${r.id}: no está en el dorado`);
        continue;
      }
      for (const f of r.frames) {
        const k = keyOf(f.lap, f.t);
        const got = expected[k];
        if (got !== f.digest) diffs.push(`${r.id}@${k}: ${got ?? '—'} → ${f.digest}`);
      }
    }
    expect(diffs.slice(0, 20).join('\n')).toBe('');
  });

  it('el dorado cubre todos los casos y todos sus fotogramas', () => {
    const golden = readGolden();
    for (const r of results) {
      const expected = golden[r.id] ?? {};
      expect(Object.keys(expected).length, `${r.id} está incompleto en el dorado`).toBe(r.frames.length);
    }
  });

  it('una escena sin pila de efectos se dibuja como con la pila vacía', () => {
    // Las recetas de la documentación omiten la pila cuando no hay efectos: el motor no debe romperse.
    const without: SceneV1 = {
      version: 1,
      objects: [{ kind: 'shape', id: 'a', name: 'a', shape: 'star', params: { radius: 40, points: 5, fillColor: '#09fdd1' } } as never],
    };
    const withEmpty: SceneV1 = {
      version: 1,
      objects: [{ kind: 'shape', id: 'a', name: 'a', shape: 'star', params: { radius: 40, points: 5, fillColor: '#09fdd1' }, stack: [] }],
    };
    const e = createEngine(builtins);
    expect(e.toSVG(without)).toBe(e.toSVG(withEmpty));
  });

});
