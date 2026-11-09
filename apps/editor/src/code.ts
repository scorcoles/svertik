// El JS del panel de código: escena generada arriba, script del usuario abajo.
import { parser } from '@lezer/javascript';
import type { Scene } from '@svertik/engine';

/** Primera línea con error de sintaxis (los SyntaxError de JS no dicen dónde). */
export function syntaxErrorLine(text: string): number | null {
  let pos: number | null = null;
  parser.parse(text).iterate({
    enter: (n) => {
      if (pos === null && n.type.isError) pos = n.from;
      return pos === null;
    },
  });
  return pos === null ? null : text.slice(0, pos).split('\n').length;
}

export const DEFAULT_SCRIPT = `// Runs every frame while ▶ is on. t = seconds.
onFrame((t) => {
  // scene.stack[0].params.phase = t * 90;
});
`;

/** Objeto en estilo JS: claves sin comillas y cadenas con comillas simples. */
export function jsLiteral(value: unknown, indent = '  '): string {
  return JSON.stringify(value, null, indent.length)
    .replace(/"([A-Za-z_$][\w$]*)":/g, '$1:')
    .replace(/"((?:[^"\\]|\\.)*)"/g, (_, s: string) => `'${s.replace(/\\"/g, '"').replace(/'/g, "\\'")}'`);
}

/** En una sola línea, con espacios: { id: 'w', params: { phase: 0 } }. */
export function inlineLiteral(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inlineLiteral).join(', ')}]`;
  if (value && typeof value === 'object') {
    const parts = Object.entries(value).map(([k, v]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`}: ${inlineLiteral(v)}`);
    return parts.length ? `{ ${parts.join(', ')} }` : '{}';
  }
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return JSON.stringify(value);
}

const sourceLiteral = (source: string) => '`' + source.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';

export function sceneTypes(scene: Scene) {
  return [...new Set(scene.stack.map((m) => m.type))];
}

/** La parte generada: import, la constante con el SVG y la escena. */
export function generatedPart(scene: Scene): string {
  const { source: _source, stack, ...rest } = scene;
  // Una línea por modificador: así se lee la pila de un vistazo.
  const head = Object.entries(rest).map(([k, v]) => `  ${k}: ${inlineLiteral(v)},`);
  const sceneText = ['{', ...head, '  source,', '  stack: [', ...stack.map((m) => `    ${inlineLiteral(m)},`), '  ],', '}'].join('\n');
  return [
    `import { createEngine, ${sceneTypes(scene).join(', ')} } from '@svertik/engine';`,
    '',
    `const source = ${sourceLiteral(scene.source)};`,
    '',
    `const scene = ${sceneText};`,
    '',
    '',
  ].join('\n');
}

/** El texto completo que se ve en la pestaña JS. */
export function jsDocument(scene: Scene, script: string) {
  return generatedPart(scene) + script;
}

/** Lo que el usuario ha escrito después de la escena (si no se encuentra, todo vale como script). */
export function extractScript(text: string): string {
  const m = /const scene = \{[\s\S]*?\n\};\n/.exec(text);
  if (!m) return DEFAULT_SCRIPT;
  return text.slice(m.index + m[0].length).replace(/^\n/, '');
}

/** Posición del literal del SVG en el documento, para plegarlo. */
export function sourceRange(text: string): [number, number] | null {
  const start = text.indexOf('const source = `');
  if (start < 0) return null;
  const open = start + 'const source = `'.length;
  let i = open;
  while (i < text.length) {
    if (text[i] === '\\') { i += 2; continue; }
    if (text[i] === '`') return [open, i];
    i++;
  }
  return null;
}

/** Fragmento autosuficiente para pegar en otra web: añade el motor y onFrame. */
export function exportJS(scene: Scene, script: string): string {
  const types = sceneTypes(scene);
  return (
    generatedPart(scene) +
    `const engine = createEngine([${types.join(', ')}]);
const live = engine.mount(document.querySelector('svg'), scene);

// onFrame(fn): llama a fn(t) en cada fotograma y vuelve a pintar.
function onFrame(fn) {
  const t0 = performance.now();
  const loop = (now) => {
    fn((now - t0) / 1000);
    live.update(scene);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

` +
    script
  );
}
