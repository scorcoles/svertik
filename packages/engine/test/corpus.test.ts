// The engine's conformance gate: the corpus cannot change unless someone accepts it.
//
// It does not decide whether a change is good (that is for whoever reads the diff), but it makes
// it visible: if the engine's output changes, the test fails and the golden file must be updated on purpose.

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

/** The font for the texts (the one the project ships). */
const fontFile = resolve(here, '../../ui/node_modules/@fontsource/commit-mono/files/commit-mono-latin-400-normal.woff');

beforeAll(async () => {
  if (cases.some(needsFont)) {
    const woff = readFileSync(fontFile);
    await registerFont('Commit Mono', woff.buffer.slice(woff.byteOffset, woff.byteOffset + woff.byteLength) as ArrayBuffer);
  }
}, 60_000);

describe('corpus', () => {
  // The corpus plays once: it is slow (every scene, all its frames).
  let results: ReturnType<typeof runCorpus>;

  beforeAll(() => {
    results = runCorpus(cases);
  }, 300_000);

  it('the engine draws what it drew when the golden file was set', () => {
    const golden = readGolden();
    const diffs: string[] = [];
    for (const r of results) {
      const expected = golden[r.id];
      if (!expected) {
        diffs.push(`${r.id}: not in the golden file`);
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

  it('the golden file covers every case and all its frames', () => {
    const golden = readGolden();
    for (const r of results) {
      const expected = golden[r.id] ?? {};
      expect(Object.keys(expected).length, `${r.id} is incomplete in the golden file`).toBe(r.frames.length);
    }
  });

  it('a scene without an effect stack draws as with an empty one', () => {
    // The doc recipes leave the stack out when there are no effects: the engine must not break.
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
