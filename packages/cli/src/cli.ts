// svertik in the terminal.
//   svertik render <input> [-o out.svg|.png] [--time s] [--scale n] [--background colour]
//                          [--frames folder] [--fps n] [--font "Name=path.ttf"]
//   svertik info <input>
//   svertik effects [--json]
//   svertik docs [folder]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateDocs } from './docs';
import { describeEffects, describeScene, frameTimes, loadInput, registerBundledFonts, registerFontFile, renderPNG, renderSVG } from './lib';

const HELP = `svertik: draws svertik projects (.svrtk, JSON or SVG) without opening the editor.

  svertik render <input> [-o out.svg|out.png]
      --time <s>          animation time (default 0)
      --scale <n>         PNG: pixels per unit (default 2)
      --background <c>    background (#rrggbb); transparent without it
      --frames <folder>   every frame of the animation, as numbered PNGs
      --fps <n>           frames per second for --frames (default: the project's)
      --font <Name=path>  registers a font for texts (can be repeated)
  svertik info <input>          summarises objects, effects and animation
  svertik effects [--json]      lists the effects and primitives with their parameters
  svertik docs [folder]         writes the reference in Markdown (default: packages/engine/docs)
`;

// If the output is cut (| head), exit quietly.
process.stdout.on('error', (e: NodeJS.ErrnoException) => e.code === 'EPIPE' && process.exit(0));

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const flags = (name: string) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]!] : []));
const positional = args.filter((a, i) => !a.startsWith('-') && !(i > 0 && args[i - 1]!.startsWith('-') && args[i - 1] !== '--json'));

function fail(message: string): never {
  process.stderr.write(`svertik: ${message}\n`);
  process.exit(1);
}

try {
  const [command, input] = positional;
  if (!command || command === 'help' || args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
  } else if (command === 'docs') {
    const out = input ?? join(import.meta.dirname, '../../engine/docs');
    process.stdout.write(`${generateDocs(out)} pages in ${join(out, 'reference')}/\n`);
  } else if (command === 'effects') {
    const d = describeEffects();
    if (args.includes('--json')) process.stdout.write(JSON.stringify(d, null, 2) + '\n');
    else for (const e of [...d.effects, ...d.shapes.map((s) => ({ ...s, kind: 'shape' }))]) process.stdout.write(`${e.type.padEnd(12)} ${String(e.kind).padEnd(10)} ${Object.keys(e.params).join(', ')}\n`);
  } else {
    if (!input) fail(`missing input (svertik ${command} <file>)`);
    await registerBundledFonts();
    for (const f of flags('--font')) await registerFontFile(f);
    const { scene, name } = loadInput(readFileSync(input, 'utf8'), input);
    if (command === 'info') process.stdout.write(describeScene(scene) + '\n');
    else if (command === 'render') {
      const scale = Number(flag('--scale') ?? 2);
      const background = flag('--background');
      const frames = flag('--frames');
      if (frames) {
        mkdirSync(frames, { recursive: true });
        const times = frameTimes(scene, flag('--fps') ? Number(flag('--fps')) : undefined);
        times.forEach((t, i) => writeFileSync(join(frames, `${name}-${String(i).padStart(4, '0')}.png`), renderPNG(renderSVG(scene, t, background), scale)));
        process.stdout.write(`${times.length} frames in ${frames}/\n`);
      } else {
        const out = flag('-o') ?? flag('--out') ?? `${name}.svg`;
        const svg = renderSVG(scene, Number(flag('--time') ?? 0), background);
        writeFileSync(out, /\.png$/i.test(out) ? renderPNG(svg, scale) : svg);
        process.stdout.write(`${out}\n`);
      }
    } else fail(`unknown command: ${command}\n\n${HELP}`);
  }
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
