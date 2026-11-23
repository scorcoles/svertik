// Updates the corpus golden file, on purpose.
//
//   pnpm --filter @svertik/engine corpus:update
//
// Only for an intended engine change: look at the diff first (which frames change and
// why) and decide the change is right.

import './env';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerFont } from '../../src/fonts';
import { cases, needsFont } from './scenes';
import { keyOf, readGolden, writeGolden, type Golden } from './golden';
import { runCorpus } from './run';

const here = dirname(fileURLToPath(import.meta.url));
const fontFile = resolve(here, '../../../ui/node_modules/@fontsource/commit-mono/files/commit-mono-latin-400-normal.woff');

async function main() {
  if (cases.some(needsFont)) {
    const woff = readFileSync(fontFile);
    await registerFont('Commit Mono', woff.buffer.slice(woff.byteOffset, woff.byteOffset + woff.byteLength) as ArrayBuffer);
  }
  const before = readGolden();
  const golden: Golden = {};
  let changed = 0;
  for (const r of runCorpus(cases)) {
    const g: Record<string, string> = {};
    for (const f of r.frames) {
      const k = keyOf(f.lap, f.t);
      const prev = before[r.id]?.[k];
      if (prev && prev !== f.digest) changed++;
      g[k] = f.digest;
    }
    golden[r.id] = g;
  }
  writeGolden(golden);
  console.log(`dorado actualizado (${changed} fotogramas cambiados)`);
}

void main();
