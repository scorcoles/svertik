// Generated reference docs (Markdown, in English): one page per effect and primitive, straight from the
// engine's schemas, plus an index. Run on every release (`pnpm docs`): the docs never lie about a parameter.
// They ship inside the npm package (docs/), so an agent working with the engine reads the version installed.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { builtins, effectDescriptions, shapeDescriptions, shapes, type ModifierDef, type ParamSpec } from '@svertik/engine';

/** Effects that take nested effects (`children`) and how. */
const CONTAINERS: Record<string, string> = {
  step: 'Takes nested effects (`children`): applies them to each element with their numbers multiplied by the element position. Nested effectors (Step, Stagger, Range, Field) are not allowed.',
  stagger: 'Takes nested effects (`children`): each element goes from them to its rest (in) or the other way (out), one after another. Nested effectors are not allowed.',
  range: 'Takes nested effects (`children`), weighted per element by its order. Nested effectors are not allowed.',
  field: 'Takes nested effects (`children`), weighted per element by its position. Nested effectors are not allowed.',
  rgbsplit: 'Takes nested effects (`children`): they apply only to the coloured copies. Anything but another RGB Split.',
};

const MENU: Record<string, string> = { deformer: 'Deform', generator: 'Generate', effector: 'Effect', style: 'Style', filter: 'Filters' };
const menuOf = (m: ModifierDef) => (m.family === 'glitch' ? 'Glitch' : m.family === 'utils' ? 'Utils' : MENU[m.kind] ?? m.kind);
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
  if (s.type === 'point') return s.unit === 'fraction' ? '[x, y], fractions of the box (0–1)' : '[x, y], px';
  if (s.type === 'angle') return 'degrees';
  if (s.type === 'seed') return 'integer';
  if (s.type === 'color') return '#rrggbb';
  return '';
}

function notes(name: string, s: ParamSpec): string {
  const out: string[] = [];
  if ('unit' in s && s.unit && s.unit !== 'fraction') out.push(`unit: ${s.unit}`);
  if (s.type === 'number' && s.unit === 'fraction') out.push('fraction of the drawing size');
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

const defaults = (params: Record<string, ParamSpec>) => Object.fromEntries(Object.entries(params).map(([n, s]) => [n, s.default]));

function effectPage(m: ModifierDef, pkg: string): string {
  const example = { id: `${m.type}-1`, type: m.type, params: defaults(m.params), ...(CONTAINERS[m.type] ? { children: [{ id: 'twist-1', type: 'twist', params: { angle: 30 } }] } : {}) };
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
  const order = ['Deform', 'Generate', 'Glitch', 'Effect', 'Style', 'Filters', 'Utils'];
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
