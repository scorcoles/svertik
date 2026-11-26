import { describe, expect, it } from 'vitest';
import type { SceneV1 } from '@svertik/engine';
import { consoleState, evaluateInScene, formatValue } from './console.svelte';

const scene: SceneV1 = {
  version: 1,
  document: { width: 1080, height: 1920 },
  custom: { speed: 3, double: { $expr: 'scene.custom.speed * 2', fallback: 0 } },
  animation: { duration: 10, loop: true, fps: 30, tracks: [{ id: 'k', node: 'ring', on: 'node', param: 'x', keys: [{ t: 0, value: 0 }, { t: 10, value: 100 }] }] },
  objects: [{
    kind: 'shape', id: 'ring', name: 'Ring', shape: 'donut',
    params: { radius: 120, innerRadius: { $expr: 'this.radius - 50', fallback: 0 } },
    stack: [{ id: 'tw', type: 'twist', params: { angle: { $expr: 'scene.time * 10', fallback: 0 } } }],
  }],
} as SceneV1;

describe('the console', () => {
  it('evaluates at the editor time, with the document variables', () => {
    expect(evaluateInScene('scene.time * 2 + scene.custom.double', scene, 1.5)).toEqual({ value: 9 });
    expect(evaluateInScene('scene.width / scene.height', scene, 0).value).toBeCloseTo(0.5625);
  });
  it('reads this.* of the selected object (keyframes and formulas applied) or effect', () => {
    expect(evaluateInScene('this.innerRadius + this.x', scene, 5, 'ring')).toEqual({ value: 120 });
    expect(evaluateInScene('this.angle', scene, 2, 'tw')).toEqual({ value: 20 });
    expect(evaluateInScene('this.radius', scene, 0).error).toMatch(/Select an object/);
  });
  it('says why when there is no value', () => {
    expect(evaluateInScene('sinn(1)', scene, 0).error).toMatch(/Unknown function/);
    expect(evaluateInScene('element.index', scene, 0).error).toMatch(/Each/);
    expect(evaluateInScene('   ', scene, 0)).toEqual({});
  });
  it('keeps what was typed for ↑/↓ and the pinned expressions', () => {
    consoleState.clear();
    consoleState.run('1 + 1', { value: 2 });
    consoleState.run('1 + 1', { value: 2 });
    consoleState.run('scene.time', { value: 0 });
    expect(consoleState.typed).toEqual(['1 + 1', 'scene.time']);
    consoleState.pin('scene.time');
    consoleState.pin('scene.time');
    expect(consoleState.pinned.filter((p) => p === 'scene.time')).toHaveLength(1);
    consoleState.unpin('scene.time');
    expect(formatValue(1 / 3)).toBe('0.333333');
  });
});

describe('the console with the editor’s live scene', () => {
  it('evaluates on reactive state (a proxy the engine cannot clone)', async () => {
    const { Editor } = await import('./editor.svelte');
    const e = new Editor();
    e.openProject(JSON.stringify(scene));
    expect(evaluateInScene('scene.object.ring.radius + this.radius', e.scene, 0, 'ring')).toEqual({ value: 240 });
  });
});
