// Generated reference docs (Markdown, in English): one page per effect and primitive, straight from the
// engine's schemas, plus an index. Run on every release (`pnpm docs`): the docs never lie about a parameter.
// They ship inside the npm package (docs/), so an agent working with the engine reads the version installed.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { builtins, effectDescriptions, EFFECT_MENUS, menuOf, shapeDescriptions, shapes, type ModifierDef, type ParamSpec } from '@svertik/engine';

/** Effects that take nested effects (`children`) and how. */
const CONTAINERS: Record<string, string> = {
  step: 'Takes nested effects (`children`): applies them to each element with their numbers multiplied by the element position. Nested effectors (Step, Stagger, Range, Field) are not allowed.',
  each: 'Takes nested effects (`children`): applies them to each element separately, evaluating their formulas with `element.*` for that element. A `shapevalues` (Shape) child rebuilds each copy of a shape object with other values for its own parameters. Nested effectors are not allowed.',
  stagger: 'Takes nested effects (`children`): each element goes from them to its rest (in) or the other way (out), one after another. Nested effectors are not allowed.',
  range: 'Takes nested effects (`children`), weighted per element by its order. Nested effectors are not allowed.',
  field: 'Takes nested effects (`children`), weighted per element by its position. Nested effectors are not allowed.',
  rigidpieces: 'Takes nested deformers and per-piece style effects (`color`, `tint`, `opacity`, `paint`, `gradient`, `feather`). Transform and Rotate 3D are deferred until a downstream deformer moves the piece. Nested effectors are not allowed.',
  rgbsplit: 'Takes nested effects (`children`): they apply only to the coloured copies. Anything but another RGB Split.',
};

const KIND_NOTE: Record<string, string> = {
  deformer: 'Deformer: moves the points of the drawing.',
  generator: 'Generator: makes new geometry (copies, pieces, cuts…).',
  effector: 'Effector: acts per element (letters, copies, pieces…), usually through nested effects.',
  style: 'Style: changes colours or paint, not the geometry.',
  filter: 'SVG filter: does not change the geometry; the browser applies it to the whole object after the rest of its stack.',
};

const code = (v: unknown) => '`' + JSON.stringify(v) + '`';
const esc = (s: string) => s.replace(/\|/g, '\\|');

function range(s: ParamSpec): string {
  if (s.type === 'enum') return s.options.map((o) => '`' + o + '`').join(', ');
  if (s.type === 'number') return [s.min !== undefined ? `min ${s.min}` : '', s.max !== undefined ? `max ${s.max}` : '', s.step !== undefined ? `step ${s.step}` : ''].filter(Boolean).join(', ');
  if (s.type === 'node') return 'id of another node';
  if (s.type === 'nodes') return 'array of node ids';
  if (s.type === 'point') return s.unit === 'fraction' ? '[x, y], fractions of the box (0–1)' : '[x, y], px';
  if (s.type === 'angle') return 'degrees';
  if (s.type === 'seed') return 'integer';
  if (s.type === 'color') return '#rrggbb';
  if (s.type === 'palette') return 'non-empty array of #rrggbb colors';
  return '';
}

function notes(name: string, s: ParamSpec): string {
  const out: string[] = [];
  if ('unit' in s && s.unit && s.unit !== 'fraction') out.push(`unit: ${s.unit}`);
  if (s.type === 'number' && s.unit === 'fraction') out.push('fraction of the drawing size');
  if (s.type === 'number' && s.defaultExpr) out.push(`left out, it follows \`${s.defaultExpr}\``);
  if (s.animatable === false) out.push('not animatable');
  if (s.showIf) out.push('only when ' + Object.entries(s.showIf).map(([k, v]) => `\`${k}\` is ${v.map((x) => '`' + x + '`').join(' or ')}`).join(' and '));
  if (s.group) out.push(`group: ${s.group}`);
  if (s.label && s.label.toLowerCase() !== name.toLowerCase()) out.push(`label: ${s.label}`);
  return out.join('; ');
}

function paramTable(params: Record<string, ParamSpec>): string {
  const rows = Object.entries(params).map(([n, s]) => `| \`${n}\` | ${s.type} | ${code(s.default)} | ${esc(range(s))} | ${esc(notes(n, s))} |`);
  return ['| Param | Type | Default | Range | Notes |', '| --- | --- | --- | --- | --- |', ...rows].join('\n');
}

// A parameter with a default formula shows it (a plain number there would stop it following the scene).
const defaults = (params: Record<string, ParamSpec>) => Object.fromEntries(Object.entries(params).map(([n, s]) => [n, s.type === 'number' && s.defaultExpr ? { $expr: s.defaultExpr, fallback: s.default } : s.default]));

function effectPage(m: ModifierDef, pkg: string): string {
  // Shape lives inside Each: its example is an Each holding it; Each's own example uses a formula per element.
  const perCopy = { id: 'shapevalues-1', type: 'shapevalues', params: { inner: { $expr: '0.2 + 0.6 * element.distance', fallback: 0.45 } } };
  const example = m.type === 'shapevalues'
    ? { id: 'each-1', type: 'each', params: { seed: 1 }, children: [perCopy] }
    : m.type === 'each'
      ? { id: `${m.type}-1`, type: m.type, params: defaults(m.params), children: [{ id: 'twist-1', type: 'twist', params: { angle: { $expr: '90 * element.u', fallback: 30 } } }, perCopy] }
      : { id: `${m.type}-1`, type: m.type, params: defaults(m.params), ...(CONTAINERS[m.type] ? { children: [{ id: 'twist-1', type: 'twist', params: { angle: 30 } }] } : {}) };
  return [
    `# ${m.label}`,
    '',
    `\`type: "${m.type}"\` · ${KIND_NOTE[m.kind] ?? m.kind} · Editor menu: **${menuOf(m)}**.`,
    '',
    effectDescriptions[m.type] ?? '',
    '',
    ...(CONTAINERS[m.type] ? [CONTAINERS[m.type]!, ''] : []),
    ...(m.mask ? ['Applied by the document after the whole stack (and its filters), as a native `<mask>`.', ''] : []),
    '## Parameters',
    '',
    paramTable(m.params as Record<string, ParamSpec>),
    '',
    'Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.',
    '',
    '## In a scene',
    '',
    'Inside a node\'s `stack` (effects run top to bottom):',
    '',
    '```json',
    JSON.stringify(example, null, 2),
    '```',
    '',
    `Generated from the schema of \`${pkg}\`. See [the index](../index.md).`,
    '',
  ].join('\n');
}

function shapePage(s: (typeof shapes)[number], pkg: string): string {
  const node = { kind: 'shape', id: `${s.type}-1`, name: s.label, shape: s.type, params: defaults(s.params as Record<string, ParamSpec>), stack: [], transform: { x: 0, y: 0 } };
  return [
    `# ${s.label}`,
    '',
    `Primitive · \`shape: "${s.type}"\`.`,
    '',
    shapeDescriptions[s.type] ?? '',
    '',
    '## Parameters',
    '',
    paramTable(s.params as Record<string, ParamSpec>),
    '',
    'Parameters can be animated with a track `{ on: "shape", param: "<name>" }`.',
    '',
    '## In a scene',
    '',
    '```json',
    JSON.stringify(node, null, 2),
    '```',
    '',
    `Generated from the schema of \`${pkg}\`. See [the index](../index.md).`,
    '',
  ].join('\n');
}

function indexPage(pkg: string): string {
  const order: string[] = [...EFFECT_MENUS];
  const by = new Map<string, ModifierDef[]>();
  for (const m of builtins as ModifierDef[]) by.set(menuOf(m), [...(by.get(menuOf(m)) ?? []), m]);
  const first = (s: string) => esc(s.split(/(?<=\.)\s/)[0] ?? s);
  const lines = [
    '# Reference',
    '',
    `Every built-in effect and primitive of \`${pkg}\`, generated from their schemas. Each page lists the parameters (type, default, range) and a JSON snippet for a scene.`,
    '',
    '## Effects',
    '',
  ];
  for (const g of order) {
    const list = by.get(g);
    if (!list?.length) continue;
    lines.push(`### ${g}`, '', '| Effect | Type | What it does |', '| --- | --- | --- |');
    for (const m of list) lines.push(`| [${m.label}](effects/${m.type}.md) | \`${m.type}\` | ${first(effectDescriptions[m.type] ?? '')} |`);
    lines.push('');
  }
  lines.push('## Primitives', '', '| Primitive | Shape | What it is |', '| --- | --- | --- |');
  for (const s of shapes) lines.push(`| [${s.label}](shapes/${s.type}.md) | \`${s.type}\` | ${first(shapeDescriptions[s.type] ?? '')} |`);
  lines.push('');
  return lines.join('\n');
}

/** Writes the reference into `out/reference` (replacing what was there). Returns how many pages. */
export function generateDocs(out: string, pkg = '@svertik/engine'): number {
  const dir = join(out, 'reference');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'effects'), { recursive: true });
  mkdirSync(join(dir, 'shapes'), { recursive: true });
  writeFileSync(join(dir, 'index.md'), indexPage(pkg));
  for (const m of builtins as ModifierDef[]) writeFileSync(join(dir, 'effects', `${m.type}.md`), effectPage(m, pkg));
  for (const s of shapes) writeFileSync(join(dir, 'shapes', `${s.type}.md`), shapePage(s, pkg));
  return 1 + builtins.length + shapes.length;
}

// ── The catalog in the engine guide (docs/ENGINE_AND_EFFECTS.md), between two markers: primitives and effects
// with every parameter, from the schemas, so the guide agents read can't drift from the engine either.
const START = '<!-- generated:catalog:start -->', END = '<!-- generated:catalog:end -->';
/** The style parameters every primitive shares (listed once). */
const STYLE = ['fill', 'fillColor', 'stroke', 'strokeColor', 'strokeWidth', 'strokeJoin', 'strokeCap', 'dash', 'gap', 'dashOffset', 'behind'];

function bullet(name: string, s: ParamSpec): string {
  const follows = s.type === 'number' && s.defaultExpr;
  const parts: string[] = [s.type === 'enum' ? s.options.map((o) => JSON.stringify(o)).join(' | ') : s.type, follows ? `default \`${s.defaultExpr}\` (ƒx; ${code(s.default)} as fallback)` : `default ${code(s.default)}`];
  if (s.type === 'number' && (s.min !== undefined || s.max !== undefined)) parts.push(`${s.min ?? '−∞'}..${s.max ?? '∞'}`);
  if ('unit' in s && s.unit) parts.push(s.unit === 'fraction' ? 'fraction' : s.unit);
  if (s.animatable === false) parts.push('not animatable');
  if (s.showIf) parts.push('only when ' + Object.entries(s.showIf).map(([k, v]) => `\`${k}\` is ${v.map((x) => '`' + x + '`').join(' or ')}`).join(' and '));
  const label = s.label && s.label.toLowerCase() !== name.toLowerCase() ? ` (**${s.label}**)` : '';
  return `   - \`${name}\`${label}: ${parts.join(', ')}`;
}

function catalog(): string {
  const lines: string[] = [START, '', '*Generated from the engine schemas by `pnpm svertik docs`; do not edit by hand. Each parameter: type (or options), default, range, unit and when it applies.*', ''];
  const first = shapes[0]!;
  lines.push('All shapes share these style parameters:', '');
  for (const n of STYLE) { const spec = (first.params as Record<string, ParamSpec>)[n]; if (spec) lines.push(bullet(n, spec).replace(/^   /, '')); }
  lines.push('', '### Shape Registry', '');
  shapes.forEach((s, i) => {
    lines.push(`${i + 1}. **\`${s.type}\`** (${s.label}): ${shapeDescriptions[s.type] ?? ''}`);
    for (const [n, spec] of Object.entries(s.params as Record<string, ParamSpec>)) if (!STYLE.includes(n)) lines.push(bullet(n, spec));
  });
  lines.push('', '## 7. Complete Modifier Catalog', '', 'Every built-in effect, by kind. The pages in `packages/engine/docs/reference/` carry the same with a JSON snippet each; longer notes on some effects follow in the sections after the catalog.', '');
  const kinds: [string, string][] = [['deformer', 'Deformers (`kind: "deformer"`): move the points of the drawing'], ['generator', 'Generators (`kind: "generator"`): make new geometry (copies, pieces, marks…)'], ['effector', 'Effectors (`kind: "effector"`): act per element, usually through nested effects'], ['style', 'Style (`kind: "style"`): colour and paint, not geometry'], ['filter', 'SVG filters (`kind: "filter"`): applied by the browser after the whole stack']];
  kinds.forEach(([kind, title], k) => {
    lines.push(`### 7.${k + 1} ${title}`, '');
    (builtins as ModifierDef[]).filter((m) => m.kind === kind).forEach((m, i) => {
      lines.push(`${i + 1}. **\`${m.type}\`** (${m.label}, menu ${menuOf(m)}): ${effectDescriptions[m.type] ?? ''}${CONTAINERS[m.type] ? ' ' + CONTAINERS[m.type] : ''}`);
      for (const [n, spec] of Object.entries(m.params as Record<string, ParamSpec>)) lines.push(bullet(n, spec));
    });
    lines.push('');
  });
  lines.push(END);
  return lines.join('\n');
}

/** Rewrites the generated catalog inside the engine guide, if the guide is there and has the markers. */
export function updateGuide(path: string): boolean {
  if (!existsSync(path)) return false;
  const text = readFileSync(path, 'utf8');
  const a = text.indexOf(START), b = text.indexOf(END);
  if (a < 0 || b < a) return false;
  writeFileSync(path, text.slice(0, a) + catalog() + text.slice(b + END.length));
  return true;
}
