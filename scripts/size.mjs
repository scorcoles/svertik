// El peso del reproductor: qué se baja de verdad para una escena.
//
//   pnpm size            → construye el reproductor y resume el peso
//   pnpm size -- escena  → además, el peso de una escena concreta (su JSON)
//
// El reproductor se compone de un trozo (svertik-player.js) y otro por efecto. Aquí se calcula lo que
// descarga el navegador: el trozo de entrada con lo que arrastra, más los efectos que usa la escena.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const playerDir = join(root, 'apps/player');
const dist = join(playerDir, 'dist');
const entry = 'svertik-player.js';

/** Construye el reproductor (si no está). */
function build() {
  execFileSync('npx', ['vite', 'build', '--config', 'vite.lib.config.ts'], { cwd: playerDir, stdio: 'ignore' });
}

/** De cada trozo: lo que importa de forma estática y lo que importa al vuelo. */
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

/** Los trozos que se bajan siempre: la entrada y lo que arrastra por importación estática. */
function statics(g, from, seen = new Set()) {
  for (const dep of g.get(from)?.statics ?? []) {
    if (seen.has(dep)) continue;
    seen.add(dep);
    statics(g, dep, seen);
  }
  return seen;
}

/** Lo que se baja al pedir un trozo: sus importaciones estáticas y las de los que carga al vuelo. */
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

// ── El núcleo: lo que se baja siempre
const core = statics(g, entry);
core.add(entry);
const coreSize = [...core].reduce((n, f) => n + gzip(f), 0);

// ── Cada efecto: lo que añade
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
lines.push('reproductor (svertik-player.js)');
lines.push(`  núcleo (siempre):   ${kb(coreSize)} gzip  ·  ${core.size} trozos`);
lines.push(`  con un SVG suelto:  ${importer ? `+${kb(gzip(importer))} (el importador)` : '—'}`);
lines.push(`  con texto:          ${opentype ? `+${kb(gzip(opentype))} (opentype.js)` : '—'}`);
lines.push('');
lines.push('cada efecto (lo que añade al núcleo)');
const sorted = [...cost.entries()].sort((a, b) => b[1].extraSize - a[1].extraSize);
for (const [type, c] of sorted) {
  const extra = c.extraSize ? `+${kb(c.extraSize)}` : 'nada';
  const shared = c.shared ? ` (comparte ${kb(c.shared)})` : '';
  lines.push(`  ${type.padEnd(12)} ${extra}${shared}`);
}
lines.push('');

// ── Una escena concreta
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
  lines.push(`escena ${sceneArg}: ${[...types].join(', ')}`);
  lines.push(`  ${kb(size)} gzip  (núcleo ${kb(coreSize)} + ${kb(size - coreSize)} de efectos)`);
  const text = JSON.stringify(scene).includes('"text"');
  if (opentype && text) lines.push(`  +${kb(gzip(opentype))} si el texto usa una fuente (opentype.js)`);
  if (importer && JSON.stringify(scene).includes('"source"')) lines.push(`  +${kb(gzip(importer))} por el SVG suelto (el importador)`);
}

process.stdout.write(lines.join('\n') + '\n');
