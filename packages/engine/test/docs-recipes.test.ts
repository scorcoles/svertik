// The scene recipes agents copy (docs/SCENE_RECIPES.md) must be valid scenes: an unknown parameter is
// silently ignored by the engine, so a stale recipe draws something else without any error.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateScene, type SceneV1 } from '../src';

const text = readFileSync(resolve(__dirname, '../../../docs/SCENE_RECIPES.md'), 'utf8');
const scenes = [...text.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]!)).filter((b) => b.version === 1 && Array.isArray(b.objects)) as SceneV1[];

describe('scene recipes', () => {
  it('has recipes', () => expect(scenes.length).toBeGreaterThanOrEqual(6));
  scenes.forEach((scene, i) => it(`recipe ${i + 1} validates with no errors or warnings`, () => {
    expect(validateScene(scene)).toEqual({ errors: [], warnings: [] });
  }));
});
