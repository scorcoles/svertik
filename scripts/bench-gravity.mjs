// Motor-only timings: three passes after warm-up, sampling the demo at 10 Hz.
// Run: node scripts/bench-gravity.mjs [--solids] [--collisions]
import { createRequire } from 'node:module';
const require = createRequire(new URL('../packages/cli/package.json', import.meta.url));
const { register } = await import(require.resolve('tsx/esm/api').replace('.cjs', '.mjs'));
register();
const { gravityProject } = await import('../apps/editor/src/demo.ts');
const { builtins, createEngine, validateScene } = await import('../packages/engine/src/index.ts');
const { registerBundledFonts } = await import('../packages/cli/src/lib.ts');
await registerBundledFonts();
const scene = gravityProject().scene;
if (process.argv.includes('--solids')) scene.objects[0].stack.find((m) => m.type === 'gravity').params.solids = ['gravity-boom'];
if (process.argv.includes('--collisions')) scene.objects[0].stack.find((m) => m.type === 'gravity').params.collisions = true;
const report = validateScene(scene);
if (report.errors.length) throw Error(JSON.stringify(report));
const median = (xs) => xs.sort((a,b)=>a-b)[Math.floor(xs.length / 2)];
for (const count of [1, 2, 3]) {
  const s = structuredClone(scene);
  s.objects[0].stack = s.objects[0].stack.slice(0, count);
  const engine = createEngine(builtins);
  const ms = [], frames = [];
  for (let repeat = 0; repeat < 4; repeat++) for (let frame = 0; frame <= scene.animation.duration * 10; frame++) {
    s.at = frame / 10;
    const start = performance.now();
    const doc = engine.evaluateDocument(s);
    const elapsed = performance.now() - start;
    if (repeat) { ms.push(elapsed); if (repeat === 3) frames.push({time:s.at, ms:elapsed, pieces:doc.geometry.shapes.length}); }
  }
  console.log(JSON.stringify({ stack: s.objects[0].stack.map(m=>m.type), median:median(ms), p95:ms[Math.floor(ms.length*.95)], slowest:Math.max(...ms), samples:frames.filter((_,i)=>[0,11,13,20,40,60,80].includes(i)) }));
}
