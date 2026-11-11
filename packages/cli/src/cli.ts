// svertik en la terminal.
//   svertik render <entrada> [-o salida.svg|.png] [--time s] [--scale n] [--background color]
//                            [--frames carpeta] [--fps n] [--font "Nombre=ruta.ttf"]
//   svertik info <entrada>
//   svertik effects [--json]
//   svertik docs [carpeta]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateDocs } from './docs';
import { describeEffects, describeScene, frameTimes, loadInput, registerBundledFonts, registerFontFile, renderPNG, renderSVG } from './lib';

const HELP = `svertik: dibuja proyectos de svertik (.svrtk, JSON o SVG) sin abrir el editor.

  svertik render <entrada> [-o salida.svg|salida.png]
      --time <s>          instante de la animación (por defecto, 0)
      --scale <n>         PNG: píxeles por unidad (por defecto, 2)
      --background <c>    fondo (#rrggbb); sin él, transparente
      --frames <carpeta>  todos los fotogramas de la animación, en PNG numerados
      --fps <n>           fotogramas por segundo para --frames (por defecto, los del proyecto)
      --font <Nombre=ruta>  registra una fuente para los textos (se puede repetir)
  svertik info <entrada>        resume objetos, efectos y animación
  svertik effects [--json]      lista los efectos y primitivas con sus parámetros
  svertik docs [carpeta]        escribe la referencia en Markdown (por defecto, packages/engine/docs)
`;

// Si la salida se corta (| head), salir sin ruido.
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
    process.stdout.write(`${generateDocs(out)} páginas en ${join(out, 'reference')}/\n`);
  } else if (command === 'effects') {
    const d = describeEffects();
    if (args.includes('--json')) process.stdout.write(JSON.stringify(d, null, 2) + '\n');
    else for (const e of [...d.effects, ...d.shapes.map((s) => ({ ...s, kind: 'shape' }))]) process.stdout.write(`${e.type.padEnd(12)} ${String(e.kind).padEnd(10)} ${Object.keys(e.params).join(', ')}\n`);
  } else {
    if (!input) fail(`falta la entrada (svertik ${command} <archivo>)`);
    registerBundledFonts();
    for (const f of flags('--font')) registerFontFile(f);
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
        process.stdout.write(`${times.length} fotogramas en ${frames}/\n`);
      } else {
        const out = flag('-o') ?? flag('--out') ?? `${name}.svg`;
        const svg = renderSVG(scene, Number(flag('--time') ?? 0), background);
        writeFileSync(out, /\.png$/i.test(out) ? renderPNG(svg, scale) : svg);
        process.stdout.write(`${out}\n`);
      }
    } else fail(`orden desconocida: ${command}\n\n${HELP}`);
  }
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
