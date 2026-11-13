// El banco de rendimiento: cuánto tarda el motor con cada escena del corpus.
//
//   pnpm --filter @svertik/engine corpus:bench
//
// Cada caso se reproduce varias veces: la primera vuelta es el arranque en frío (lo que ve
// quien abre una web) y las siguientes, el estado estable (lo que se ve al reproducir).

import './env';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerFont } from '../../src/fonts';
import { cases, needsFont } from './scenes';
import { runCorpus, summarise, type CorpusResult } from './run';

// Con CORPUS_ENGINE se puede medir otro motor (una copia anterior), para comparar.
if (process.env.CORPUS_ENGINE) await import(process.env.CORPUS_ENGINE);

const here = dirname(fileURLToPath(import.meta.url));
const fontFile = resolve(here, '../../../ui/node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff');

/** Cada caso, repetido: la mediana de las vueltas es el número estable. */
const repeats = Number(process.env.CORPUS_REPEATS ?? 3);

async function main() {
  if (cases.some(needsFont)) {
    const woff = readFileSync(fontFile);
    await registerFont('JetBrains Mono', woff.buffer.slice(woff.byteOffset, woff.byteOffset + woff.byteLength) as ArrayBuffer);
  }
  const results: CorpusResult[] = [];
  for (const c of cases) {
    const runs = Array.from({ length: repeats }, () => runCorpus([c])[0]!);
    // La mediana de las vueltas "estable" de cada repetición.
    const laps = runs[0]!.frames.map((f) => f.lap);
    const last = laps[laps.length - 1]!;
    const perLap = laps.map((lap) => {
      const ms = runs.map((r) => r.frames.filter((f) => f.lap === lap).reduce((a, f) => a + f.ms, 0) / Math.max(1, r.frames.filter((f) => f.lap === lap).length));
      ms.sort((a, b) => a - b);
      return ms[Math.floor(ms.length / 2)]!;
    });
    results.push({
      id: c.id,
      frames: runs[0]!.frames,
      ms: perLap.reduce((a, b) => a + b, 0),
      steadyMs: perLap[perLap.length - 1]!,
    });
  }
  console.log(summarise(results));
  const total = results.reduce((a, r) => a + r.steadyMs, 0);
  console.log(`\ntotal (casos estables): ${total.toFixed(1)} ms`);
}

void main();
