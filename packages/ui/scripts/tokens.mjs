// tokens/penpot.json → src/lib/tokens.css
// Los primitivos van en :root; los semánticos del tema, como referencias a los primitivos.
import { readFileSync, writeFileSync } from 'node:fs';

const src = JSON.parse(readFileSync(new URL('../tokens/penpot.json', import.meta.url), 'utf8'));
const varName = (name) => `--sv-${name.replace(/\./g, '-')}`;
const PX = new Set(['spacing', 'fontSizes', 'borderRadius', 'borderWidth', 'sizing']);

const value = (type, v) => {
  if (typeof v === 'string' && v.startsWith('{')) return `var(${varName(v.slice(1, -1))})`;
  if (type === 'fontFamilies') return `'${v}', ui-monospace, SFMono-Regular, Menlo, monospace`;
  if (PX.has(type)) return `${v}px`;
  return String(v);
};

const block = (selector, groups) => {
  const lines = [];
  for (const [type, tokens] of Object.entries(groups)) {
    for (const [name, v] of Object.entries(tokens)) lines.push(`  ${varName(name)}: ${value(type, v)};`);
  }
  return `${selector} {\n${lines.join('\n')}\n}\n`;
};

const css = [
  '/* Generado por scripts/tokens.mjs desde tokens/penpot.json. No editar a mano. */',
  block(':root', src.primitives),
  block(":root,\n[data-sv-theme='dark']", src['theme/dark']),
].join('\n');

writeFileSync(new URL('../src/lib/tokens.css', import.meta.url), css);
console.log('tokens.css generado');
