// runCode: runs svertikJS code (as the editor's JS tab and code.svertik.com hold it) and gives its scene.
// Imports from '@svertik/js' get the library; other imports are dropped. The scene is the default export,
// or, in older code, a `const scene = { … }` literal.
import type { SceneV1 } from '@svertik/engine';
import * as core from './core';
import * as ease from './ease';
import * as generated from './generated';
import * as objects from './objects';
import * as values from './values';

/** What `import { … } from '@svertik/js'` gives the code. */
const api: Record<string, unknown> = { ...core, ...values, ...ease, ...generated, ...objects };

export interface RunResult { scene: SceneV1; warnings: string[] }

const IMPORT = /^[ \t]*import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*(?:\*\s+as\s+([\w$]+)\s*)?from\s*['"]([^'"]+)['"]\s*;?/gm;

/**
 * Runs the code and builds its scene. `globals` are extra names the code can use (`onFrame`…). Line
 * numbers in errors match the code: imports are blanked, not removed, and nothing is added before line 1.
 */
export function runCode(code: string, globals: Record<string, unknown> = {}): RunResult {
  const names: [string, unknown][] = Object.entries(globals);
  const body = code.replace(IMPORT, (statement, _default: string | undefined, list: string | undefined, star: string | undefined, from: string) => {
    if (from === '@svertik/js') {
      for (const part of (list ?? '').split(',').map((p) => p.trim()).filter(Boolean)) {
        const [orig, local = orig] = part.split(/\s+as\s+/).map((p) => p.trim()) as [string, string?];
        if (!(orig in api)) throw new Error(`'@svertik/js' has no export named ${orig}`);
        names.push([local, api[orig]]);
      }
      if (star) names.push([star, api]);
    }
    return statement.replace(/[^\n]/g, ' ');
  }).replace(/^([ \t]*)export\s+default\s+/m, '$1__default__ = ');
  const imported = new Set(names.map(([n]) => n));
  const legacy = imported.has('scene') ? 'undefined' : 'typeof scene === "undefined" ? undefined : scene';
  const run = new Function(...names.map(([n]) => n), `let __default__; ${body}\n;return [__default__, ${legacy}];`) as (...args: unknown[]) => [unknown, unknown];
  const [exported, literal] = run(...names.map(([, v]) => v));
  let value = exported ?? literal;
  if (typeof value === 'function') value = (value as () => unknown)();
  if (value && typeof (value as { build?: unknown }).build === 'function') return (value as { build: () => RunResult }).build();
  if (value && typeof value === 'object' && Array.isArray((value as SceneV1).objects)) return { scene: value as SceneV1, warnings: [] };
  throw new Error('The code must end with export default scene({ … }, …)');
}
