// Publishes the hosted editor (editor.svertik.com) from this checkout.
//
//   pnpm run deploy            checks, tests, publishes, verifies
//   pnpm run deploy --dry-run  checks and tests only
//
// The hosting step itself (server, analytics and consent layer) is private and lives outside this repository,
// so the open-source editor stays free of it. Point SVERTIK_HOSTED_DEPLOY at that script; by default it is
// ~/.config/svertik-editor-hosted/deploy.mjs. Without it, this script stops before publishing.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');
const hosted = process.env.SVERTIK_HOSTED_DEPLOY || join(homedir(), '.config/svertik-editor-hosted/deploy.mjs');
const editorUrl = (process.env.SVERTIK_EDITOR_URL || 'https://editor.svertik.com/').replace(/\/?$/, '/');
const { version } = JSON.parse(readFileSync(join(repo, 'apps/editor/package.json'), 'utf8'));

const fail = (message) => {
  console.error(`\ndeploy: ${message}`);
  process.exit(1);
};
const git = (...args) => {
  const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (r.status !== 0) fail(`git ${args.join(' ')} failed:\n${r.stderr}`);
  return r.stdout.trim();
};
const run = (command, args) => {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  const r = spawnSync(command, args, { cwd: repo, stdio: 'inherit' });
  if (r.status !== 0) fail(`${command} ${args.join(' ')} failed (${r.status ?? r.signal}).`);
};

// 1. Publish only what is committed and pushed on main, so the live editor always matches a commit.
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== 'main') fail(`on branch "${branch}"; deploy from main.`);
const dirty = git('status', '--porcelain');
if (dirty) fail(`uncommitted changes:\n${dirty}\nCommit or stash them first.`);
git('fetch', '--quiet', 'origin', 'main');
const head = git('rev-parse', 'HEAD');
if (head !== git('rev-parse', 'origin/main')) fail('main differs from origin/main; push (or pull) first.');
console.log(`deploy: editor ${version} at ${head.slice(0, 7)}`);

// 2. The whole test suite (the hosted step typechecks and builds the editor itself).
run('pnpm', ['test']);

if (dryRun) {
  console.log('\ndeploy: dry run, checks and tests passed. Nothing published.');
  process.exit(0);
}

// 3. The private hosting step.
if (!existsSync(hosted)) fail(`private hosting script not found at ${hosted}. Set SVERTIK_HOSTED_DEPLOY.`);
run('node', [hosted, repo]);

// 4. Verify: the live index loads, every script it reaches loads, and one of them carries this version
// (the editor reads it from its package.json, so it lands in one of the bundle's chunks).
const page = await fetch(editorUrl, { cache: 'no-store' });
if (!page.ok) fail(`${editorUrl} answered ${page.status}.`);
const html = await page.text();
const queue = [...html.matchAll(/<script[^>]+src="\.?\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
if (!queue.length) fail(`no editor script found in ${editorUrl}.`);
const seen = new Set();
const versionLiteral = new RegExp(`["'\`]${version.replace(/\./g, '\\.')}["'\`]`);
let found = false;
while (queue.length && seen.size < 200) {
  const src = queue.shift();
  if (seen.has(src)) continue;
  seen.add(src);
  const r = await fetch(new URL(src, editorUrl), { cache: 'no-store' });
  if (!r.ok) fail(`${src} answered ${r.status}.`);
  const code = await r.text();
  if (versionLiteral.test(code)) found = true;
  for (const m of code.matchAll(/["'`](?:\.\/|\/?assets\/)([\w.-]+\.js)["'`]/g)) queue.push(`assets/${m[1]}`);
}
if (!found) fail(`${editorUrl} is up, but none of its ${seen.size} scripts reports version ${version}.`);
console.log(`\ndeploy: ${editorUrl} serves editor ${version} (${head.slice(0, 7)}).`);
