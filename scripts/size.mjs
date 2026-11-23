// The player's weight: what a scene really downloads.
//
//   pnpm size            → builds the player and summarises its weight
//   pnpm size -- scene   → also the weight of one scene (its JSON)
//
// The player is one chunk (svertik.js) plus one per effect. This computes what the browser
// downloads: the entry chunk with what it pulls in, plus the effects the scene uses.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const playerDir = join(root, 'apps/player');
const dist = join(playerDir, 'dist');
const entry = 'svertik.js';

/** Builds the player (if it is not built). */
function build() {
  execFileSync('npx', ['vite', 'build', '--config', 'vite.lib.config.ts'], { cwd: playerDir, stdio: 'ignore' });
}

/** For each chunk: what it imports statically and what it imports on demand. */
function graph() {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.js')) files.push(full);
    }
  };
  walk(dist);
  const out = new Map();
  for (const full of files) {
    const code = readFileSync(full, 'utf8');
    const statics = new Set();
    const dynamics = new Set();
    for (const m of code.matchAll(/\bfrom\s*["'](\.[^"']+)["']/g)) statics.add(m[1]);
    for (const m of code.matchAll(/\bimport\(\s*["'](\.[^"']+)["']\s*\)/g)) dynamics.add(m[1]);
    const rel = (p) => {
      const target = resolve(join(full, '..'), p);
      return existsSync(target) ? relative(dist, target) : null;
    };
    out.set(relative(dist, full), {
      statics: [...statics].map(rel).filter(Boolean),
      dynamics: [...dynamics].map(rel).filter(Boolean),
    });
  }
  return out;
}

const gzip = (file) => gzipSync(readFileSync(join(dist, file))).length;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

/** The chunks always downloaded: the entry and what it pulls in statically. */
function statics(g, from, seen = new Set()) {
  for (const dep of g.get(from)?.statics ?? []) {
    if (seen.has(dep)) continue;
    seen.add(dep);
    statics(g, dep, seen);
  }
  return seen;
}

/** What asking for a chunk downloads: its static imports and those of what it loads on demand. */
function withDynamics(g, from, seen = new Set()) {
  const all = new Set(statics(g, from));
  for (const dep of g.get(from)?.dynamics ?? []) {
    if (seen.has(dep)) continue;
    seen.add(dep);
    for (const d of withDynamics(g, dep, seen)) all.add(d);
  }
  return all;
}

build();
const g = graph();
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));

// ── The core: what is always downloaded
const core = statics(g, entry);
core.add(entry);
const coreSize = [...core].reduce((n, f) => n + gzip(f), 0);

// ── Each effect: what it adds
const cost = new Map();
for (const [type, file] of Object.entries(manifest.types)) {
  const need = withDynamics(g, file);
  need.add(file);
  const extra = [...need].filter((f) => !core.has(f));
  const extraSize = extra.reduce((n, f) => n + gzip(f), 0);
  const total = [...need].reduce((n, f) => n + gzip(f), 0);
  cost.set(type, { file, extra, extraSize, total, shared: total - extraSize });
}

// ── Las partes caras, aparte
const opentype = [...g.keys()].find((f) => f.includes('opentype'));
const importer = [...g.keys()].find((f) => /(^|\/)import-/.test(f));

// ── Resumen
const lines = [];
lines.push('player (svertik.js)');
lines.push(`  core (always):      ${kb(coreSize)} gzip  ·  ${core.size} chunks`);
lines.push(`  with raw SVG:      ${importer ? `+${kb(gzip(importer))} (the importer)` : '—'}`);
lines.push(`  with text:         ${opentype ? `+${kb(gzip(opentype))} (opentype.js)` : '—'}`);
lines.push('');
lines.push('each effect (what it adds to the core)');
const sorted = [...cost.entries()].sort((a, b) => b[1].extraSize - a[1].extraSize);
for (const [type, c] of sorted) {
  const extra = c.extraSize ? `+${kb(c.extraSize)}` : 'nada';
  const shared = c.shared ? ` (shares ${kb(c.shared)})` : '';
  lines.push(`  ${type.padEnd(12)} ${extra}${shared}`);
}
lines.push('');

// ── One scene
const sceneArg = process.argv[2];
if (sceneArg && sceneArg !== '--') {
  const file = resolve(process.cwd(), sceneArg);
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const scene = raw.svertik === 'project' ? raw.scene : raw;
  const types = new Set();
  const stack = (list) => list.forEach((m) => { types.add(m.type); if (m.children) stack(m.children); });
  const walk = (nodes) => nodes.forEach((n) => {
    stack(n.stack ?? []);
    if (n.kind === 'group') walk(n.children);
  });
  walk(scene.objects ?? []);
  const need = new Set();
  for (const t of types) for (const f of cost.get(t)?.extra ?? []) need.add(f);
  const size = coreSize + [...need].reduce((n, f) => n + gzip(f), 0);
  lines.push(`scene ${sceneArg}: ${[...types].join(', ')}`);
  lines.push(`  ${kb(size)} gzip  (core ${kb(coreSize)} + ${kb(size - coreSize)} of effects)`);
  const text = JSON.stringify(scene).includes('"text"');
  if (opentype && text) lines.push(`  +${kb(gzip(opentype))} if the text uses a font (opentype.js)`);
  if (importer && JSON.stringify(scene).includes('"source"')) lines.push(`  +${kb(gzip(importer))} for raw SVG (the importer)`);
}

process.stdout.write(lines.join('\n') + '\n');
