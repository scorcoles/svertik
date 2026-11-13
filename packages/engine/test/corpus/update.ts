// Actualiza el dorado del corpus a propósito.
//
//   pnpm --filter @svertik/engine corpus:update
//
// Solo se usa cuando el cambio en el motor es intencionado: antes hay que mirar el diff
// (qué fotogramas cambian y por qué) y decidir que el cambio es el correcto.

import './env';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerFont } from '../../src/fonts';
import { cases, needsFont } from './scenes';
import { keyOf, readGolden, writeGolden, type Golden } from './golden';
import { runCorpus } from './run';

const here = dirname(fileURLToPath(import.meta.url));
const fontFile = resolve(here, '../../../ui/node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff');

async function main() {
  if (cases.some(needsFont)) {
    const woff = readFileSync(fontFile);
    await registerFont('JetBrains Mono', woff.buffer.slice(woff.byteOffset, woff.byteOffset + woff.byteLength) as ArrayBuffer);
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
