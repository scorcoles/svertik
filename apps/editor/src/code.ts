// The code panel's JS: the scene as svertikJS on top, the user's script below. `generatedPart` (the scene
// as a JSON literal) stays for exported, self-contained JS.
import { parser } from '@lezer/javascript';
import { toCode } from '@svertik/js';
import { sceneFonts, walkNodes, type ModifierInstance, type SceneNode, type SceneV1 } from '@svertik/engine';

/** First line with a syntax error (JS SyntaxErrors do not say where). */
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

export const DEFAULT_SCRIPT = `// Edit the scene above; changes appear live.
`;

/** Object in JS style: unquoted keys and single-quoted strings. */
export function jsLiteral(value: unknown, indent = '  '): string {
  return JSON.stringify(value, null, indent.length)
    .replace(/"([A-Za-z_$][\w$]*)":/g, '$1:')
    .replace(/"((?:[^"\\]|\\.)*)"/g, (_, s: string) => `'${s.replace(/\\"/g, '"').replace(/'/g, "\\'")}'`);
}

/** On one line, with spaces: { id: 'w', params: { phase: 0 } }. */
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

export function sceneTypes(scene: SceneV1): string[] {
  const types = new Set<string>();
  const add = (stack: ModifierInstance[]) => {
    for (const m of stack) {
      types.add(m.type);
      if (m.children) add(m.children);
    }
  };
  for (const { node } of walkNodes(scene.objects)) add(node.stack);
  return [...types];
}

/** Variable name from the file name: "Star Logo.svg" → starLogo. Unique. */
function variableNames(scene: SceneV1): Map<string, string> {
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
  // A pack, with only what is drawn: the original is not needed to play it.
  if (node.kind === 'object' && node.packed) head.push(`source: ''`, `packed: ${inlineLiteral({ key: node.packed.key, geometry: node.packed.geometry, at: node.packed.at })}`);
  else if (node.kind === 'object') head.push(`source: ${vars.get(node.id)}`);
  const inner = indent + '  ';
  const list = (items: string[]) => (items.length ? `[\n${items.map((x) => `${inner}  ${x},`).join('\n')}\n${inner}]` : '[]');
  const parts = [...head, `stack: ${list(stack.map((m) => inlineLiteral(m)))}`];
  if (node.children) parts.push(`children: [\n${node.children.map((c) => `${inner}  ${writeNode(c, vars, inner + '  ')},`).join('\n')}\n${inner}]`);
  return `{\n${parts.map((p) => `${inner}${p},`).join('\n')}\n${indent}}`;
}

/** The generated part: import, one constant per SVG, and the scene. */
export function generatedPart(scene: SceneV1): string {
  const vars = variableNames(scene);
  const consts: string[] = [];
  for (const { node } of walkNodes(scene.objects)) if (node.kind === 'object' && !node.packed) consts.push(`const ${vars.get(node.id)} = ${sourceLiteral(node.source)};`);
  const { objects, ...rest } = scene;
  const head = Object.entries(rest).map(([k, v]) => `  ${k}: ${inlineLiteral(v)},`);
  const sceneText = ['{', ...head, '  objects: [', ...objects.map((n) => `    ${writeNode(n, vars, '    ')},`), '  ],', '}'].join('\n');
  return [
    `import { createEngine, ${[...sceneTypes(scene), ...(scene.fullViewport || scene.clipToDocument || scene.animation?.infinite || scene.animation?.tracks.length || scene.interactions?.length || [...walkNodes(scene.objects)].some(({ node }) => node.kind === 'instance' && node.mouse) ? ['createPlayer'] : [])].join(', ')} } from '@svertik/engine';`.replace(', }', ' }').replace('createEngine,  }', 'createEngine }'),
    '',
    ...consts,
    '',
    `const scene = ${sceneText};`,
    '',
    '',
  ].join('\n');
}

/** The full text shown in the JS tab: the scene in svertikJS, then the user's script. */
export function jsDocument(scene: SceneV1, script: string) {
  return `${toCode(scene)}\n${script}`;
}

/** What the user wrote after the scene: after the line that closes `export default scene(…)`. */
export function extractScript(text: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith('export default '));
  if (start < 0) return DEFAULT_SCRIPT;
  // The scene call ends on a line of its own, ");" (or on its first line when it holds no objects).
  const end = lines[start]!.trimEnd().endsWith(');') ? start : lines.findIndex((l, i) => i > start && /^\);?\s*$/.test(l));
  if (end < 0) return DEFAULT_SCRIPT;
  return lines.slice(end + 1).join('\n').replace(/^\n/, '');
}

/** Position of each literal with an SVG (const x = `<svg…`), to fold them. */
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

/** The first one (compatibility). */
export const sourceRange = (text: string) => sourceRanges(text)[0] ?? null;

/** Self-contained snippet to paste into another page: adds the engine and onFrame. */
export function exportJS(scene: SceneV1, script: string): string {
  const types = sceneTypes(scene);
  // With animation or interactions, the engine player (timeline, hover, click and "reduce motion").
  const player = !!(scene.fullViewport || scene.clipToDocument || scene.animation?.infinite || scene.animation?.tracks.length || scene.interactions?.length || [...walkNodes(scene.objects)].some(({ node }) => node.kind === 'instance' && node.mouse));
  // With texts, their fonts (free, from Fontsource) are downloaded before drawing.
  const fonts = sceneFonts(scene).length > 0;
  const head = generatedPart(scene);
  return (
    (fonts ? head.replace('import { createEngine', 'import { createEngine, loadFonts') : head) +
    (fonts ? `// The texts' fonts (Fontsource, from jsDelivr).\nawait loadFonts(scene);\n\n` : '') +
    `const engine = createEngine([${types.join(', ')}]);
` +
    (player
      ? `// Plays the timeline and responds to hover and click. With "reduce motion", without transitions.
const player = createPlayer(engine, document.querySelector('svg'), scene);

// onFrame(fn): calls fn(t) on every frame and paints again.
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

// onFrame(fn): calls fn(t) on every frame and paints again.
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
