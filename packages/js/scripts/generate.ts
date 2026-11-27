// Writes src/generated.ts from the engine's shapes and effects: a factory per shape (`ellipse(…)`), a
// free-standing factory and a chain method per effect (`twist(…)`, `.twist(…)`), and the type of each one's
// parameters with its label, default, range and unit. Run with `pnpm --filter @svertik/js generate` after
// adding or changing an effect or shape; a test fails while the file is stale.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generate } from '../src/generate-source';

const out = fileURLToPath(new URL('../src/generated.ts', import.meta.url));
writeFileSync(out, generate());
console.log(`svertikJS: wrote ${out}`);
