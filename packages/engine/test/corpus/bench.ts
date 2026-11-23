// The performance bench: how long the engine takes with each corpus scene.
//
//   pnpm --filter @svertik/engine corpus:bench
//
// Each case plays several times: the first lap is the cold start (what someone opening a page
// sees) and the next ones the steady state (what playback looks like).

import './env';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerFont } from '../../src/fonts';
import { initKernels } from '../../src/kernels';
import { cases, needsFont } from './scenes';
import { runCorpus, summarise, type CorpusResult } from './run';

// CORPUS_ENGINE measures another engine (an earlier copy), to compare.
if (process.env.CORPUS_ENGINE) await import(process.env.CORPUS_ENGINE);

const here = dirname(fileURLToPath(import.meta.url));
const fontFile = resolve(here, '../../../ui/node_modules/@fontsource/commit-mono/files/commit-mono-latin-400-normal.woff');

/** Each case, repeated: the median of the laps is the steady number. */
const repeats = Number(process.env.CORPUS_REPEATS ?? 3);

async function main() {
  // What `prepareScene` does in the player: the kernel, if the scene uses Metaball.
  const kernels = await initKernels();
  if (!kernels) console.warn('kernels: not available (measuring the TypeScript version)');
  if (cases.some(needsFont)) {
    const woff = readFileSync(fontFile);
    await registerFont('Commit Mono', woff.buffer.slice(woff.byteOffset, woff.byteOffset + woff.byteLength) as ArrayBuffer);
  }
  const results: CorpusResult[] = [];
  for (const c of cases) {
    const runs = Array.from({ length: repeats }, () => runCorpus([c])[0]!);
    // The median of the "steady" laps of each repetition.
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
