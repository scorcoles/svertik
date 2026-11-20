// Reproducible CPU-only playback: nine crosses, four carrying an elastic material.
// Run: node scripts/bench-softbody.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(new URL('../packages/cli/package.json', import.meta.url));
const { register } = await import(require.resolve('tsx/esm/api').replace('.cjs', '.mjs'));
register();
const { builtins, createEngine, validateScene } = await import('../packages/engine/src/index.ts');
const scene = JSON.parse(readFileSync(new URL('../apps/editor/public/demos/softbody-material.svrtk', import.meta.url), 'utf8'));
const report = validateScene(scene);
if (report.errors.length || report.warnings.length) throw Error(JSON.stringify(report));
const engine = createEngine(builtins), samples = [];
for (let frame = 0; frame <= 90; frame++) {
  const before = performance.now();
  const doc = engine.evaluateDocument({ ...scene, at: frame / 30 });
  const ms = performance.now() - before;
  if (frame > 1) samples.push(ms);
  if (frame % 30 === 0) console.log(JSON.stringify({ time: frame / 30, ms, shapes: doc.geometry.shapes.length }));
}
samples.sort((a, b) => a - b);
console.log(JSON.stringify({ median: samples[Math.floor(samples.length / 2)], p95: samples[Math.floor(samples.length * 0.95)], slowest: samples.at(-1), note: 'CPU evaluation only; excludes DOM updates and painting' }));
