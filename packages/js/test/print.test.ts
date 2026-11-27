// toCode ↔ runCode: every demo and recipe, printed as svertikJS and run again, validates, prints the
// same code a second time and draws the same paths.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { builtins, createEngine, sampleScene, validateScene, type SceneV1 } from '@svertik/engine';
import { describe, expect, it } from 'vitest';
import { runCode, toCode } from '../src';
import * as builtDemos from '../../../apps/editor/src/demo';

const root = join(import.meta.dirname, '../../..');
const demos = readdirSync(join(root, 'apps/editor/public/demos')).filter((f) => f.endsWith('.json')).map((f) => {
  const data = JSON.parse(readFileSync(join(root, 'apps/editor/public/demos', f), 'utf8')) as { svertik?: string; scene?: SceneV1 };
  return [f, (data.svertik === 'project' ? data.scene : data) as SceneV1] as const;
});
const recipes = [...readFileSync(join(root, 'docs/SCENE_RECIPES.md'), 'utf8').matchAll(/```json\n([\s\S]*?)\n```/g)]
  .map((m) => { try { return JSON.parse(m[1]!) as SceneV1; } catch { return null; } })
  .filter((s): s is SceneV1 => !!s && Array.isArray(s.objects))
  .map((s, i) => [`recipe ${i + 1}`, s] as const);

// A fresh engine each time: Trace draws its trail from what the engine has already seen.
const paths = (s: SceneV1, t: number) => [...createEngine(builtins).toSVG(sampleScene(s, t)).matchAll(/ d="([^"]*)"/g)].map((m) => m[1]);

const projects = Object.entries(builtDemos).filter(([, f]) => typeof f === 'function').map(([name, f]) => [name, (f as () => { scene: SceneV1 })().scene] as const);

describe.each([...demos, ...recipes, ...projects])('%s', (_name, original) => {
  it('round-trips through svertikJS', () => {
    const code = toCode(original);
    const { scene } = runCode(code);
    if (!validateScene(original, builtins).errors.length) expect(validateScene(scene, builtins).errors).toEqual([]);
    expect(toCode(scene)).toBe(code);
    for (const t of [0, Math.min(0.5, original.animation?.duration ?? 0)]) expect(paths(scene, t)).toEqual(paths(original, t));
  });
});
