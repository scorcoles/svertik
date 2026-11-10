// El JS del panel de código: escena generada arriba, script del usuario abajo.
import { parser } from '@lezer/javascript';
import { migrateScene, walkNodes, type AnyScene, type ModifierInstance, type SceneNode, type SceneV2 } from '@svertik/engine';

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

export function sceneTypes(scene: AnyScene): string[] {
  const v2 = migrateScene(scene);
  const types = new Set<string>();
  const add = (stack: ModifierInstance[]) => {
    for (const m of stack) {
      types.add(m.type);
      if (m.children) add(m.children);
    }
  };
  for (const { node } of walkNodes(v2.objects)) add(node.stack);
  return [...types];
}

/** Nombre de variable a partir del nombre del archivo: «Star Logo.svg» → starLogo. Únicos. */
function variableNames(scene: SceneV2): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set(['scene', 'source', 'engine', 'live', 'onFrame', 'createEngine']);
  for (const { node } of walkNodes(scene.objects)) {
    if (node.kind !== 'object') continue;
    const words = node.name.replace(/\.svg$/i, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
    let base = words.map((w, i) => (i ? w[0]!.toUpperCase() + w.slice(1) : w.toLowerCase())).join('') || 'drawing';
    if (/^\d/.test(base)) base = `svg${base}`;
    let name = base;
    for (let i = 2; used.has(name); i++) name = `${base}${i}`;
    used.add(name);
    out.set(node.id, name);
  }
  return out;
}

function writeNode(node: SceneNode, vars: Map<string, string>, indent: string): string {
  const { stack, ...rest } = node;
  const head = Object.entries(rest)
    .filter(([k]) => k !== 'children' && k !== 'source' && k !== 'packed')
    .map(([k, v]) => `${k}: ${inlineLiteral(v)}`);
  // Un paquete, solo con lo que se dibuja: el original no hace falta para reproducirlo.
  if (node.kind === 'object' && node.packed) head.push(`source: ''`, `packed: ${inlineLiteral({ key: node.packed.key, geometry: node.packed.geometry, at: node.packed.at })}`);
  else if (node.kind === 'object') head.push(`source: ${vars.get(node.id)}`);
  const inner = indent + '  ';
  const list = (items: string[]) => (items.length ? `[\n${items.map((x) => `${inner}  ${x},`).join('\n')}\n${inner}]` : '[]');
  const parts = [...head, `stack: ${list(stack.map((m) => inlineLiteral(m)))}`];
  if (node.kind === 'group') parts.push(`children: [\n${node.children.map((c) => `${inner}  ${writeNode(c, vars, inner + '  ')},`).join('\n')}\n${inner}]`);
  return `{\n${parts.map((p) => `${inner}${p},`).join('\n')}\n${indent}}`;
}

/** La parte generada: import, una constante por SVG y la escena. */
export function generatedPart(scene: AnyScene): string {
  const v2 = migrateScene(scene);
  const vars = variableNames(v2);
  const consts: string[] = [];
  for (const { node } of walkNodes(v2.objects)) if (node.kind === 'object' && !node.packed) consts.push(`const ${vars.get(node.id)} = ${sourceLiteral(node.source)};`);
  const { objects, ...rest } = v2;
  const head = Object.entries(rest).map(([k, v]) => `  ${k}: ${inlineLiteral(v)},`);
  const sceneText = ['{', ...head, '  objects: [', ...objects.map((n) => `    ${writeNode(n, vars, '    ')},`), '  ],', '}'].join('\n');
  return [
    `import { createEngine, ${[...sceneTypes(v2), ...(v2.animation?.tracks.length || v2.interactions?.length ? ['createPlayer'] : [])].join(', ')} } from '@svertik/engine';`.replace(', }', ' }').replace('createEngine,  }', 'createEngine }'),
    '',
    ...consts,
    '',
    `const scene = ${sceneText};`,
    '',
    '',
  ].join('\n');
}

/** El texto completo que se ve en la pestaña JS. */
export function jsDocument(scene: AnyScene, script: string) {
  return generatedPart(scene) + script;
}

/** Lo que el usuario ha escrito después de la escena (si no se encuentra, todo vale como script). */
export function extractScript(text: string): string {
  const m = /const scene = \{[\s\S]*?\n\};\n/.exec(text);
  if (!m) return DEFAULT_SCRIPT;
  return text.slice(m.index + m[0].length).replace(/^\n/, '');
}

/** Posición de cada literal con un SVG (const x = `<svg…`), para plegarlos. */
export function sourceRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  const re = /const [A-Za-z_$][\w$]* = `/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const open = m.index + m[0].length;
    if (!text.startsWith('<', open) && !text.startsWith('<?', open)) continue;
    let i = open;
    while (i < text.length) {
      if (text[i] === '\\') { i += 2; continue; }
      if (text[i] === '`') { out.push([open, i]); break; }
      i++;
    }
  }
  return out;
}

/** El primero (compatibilidad). */
export const sourceRange = (text: string) => sourceRanges(text)[0] ?? null;

/** Fragmento autosuficiente para pegar en otra web: añade el motor y onFrame. */
export function exportJS(scene: AnyScene, script: string): string {
  const v2 = migrateScene(scene);
  const types = sceneTypes(scene);
  // Con animación o interacciones, el reproductor del motor (línea de tiempo, hover, clic y «reducir movimiento»).
  const player = !!(v2.animation?.tracks.length || v2.interactions?.length);
  return (
    generatedPart(scene) +
    `const engine = createEngine([${types.join(', ')}]);
` +
    (player
      ? `// Reproduce la línea de tiempo y responde a hover y clic. Con «reducir movimiento», sin transiciones.
const player = createPlayer(engine, document.querySelector('svg'), scene);

// onFrame(fn): llama a fn(t) en cada fotograma y vuelve a pintar.
function onFrame(fn) {
  const t0 = performance.now();
  const loop = (now) => {
    fn((now - t0) / 1000);
    player.refresh();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

`
      : `const live = engine.mount(document.querySelector('svg'), scene);

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

`) +
    script
  );
}
