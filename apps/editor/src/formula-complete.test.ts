import { describe, expect, it } from 'vitest';
import { completionsAt } from './formula-complete';

const scope = { scene: { version: 1 as const, objects: [], custom: { speed: 2 } }, objects: { 'esfera.x': 10, 'esfera.radius': 80, 'esfera.grid.angle': 30, 'caja.width': 4 }, self: ['radius', 'innerRadius'] };
const labels = (before: string, s: Parameters<typeof completionsAt>[1] = scope) => completionsAt(before, s)?.items.map((i) => i.label);

describe('formula suggestions', () => {
  it('offer the scene values after scene., and the objects then their values and effects', () => {
    expect(labels('scene.ti')).toEqual(['time', 'duration', 'pixelRatio']);
    expect(labels('1 + scene.object.')).toEqual(['esfera', 'caja']);
    expect(labels('scene.object.esfera.')).toEqual(['x', 'radius', 'grid']);
    expect(completionsAt('scene.object.esfera.g', scope)).toMatchObject({ from: 'scene.object.esfera.'.length, items: [{ label: 'grid', insert: 'grid.' }] });
    expect(labels('scene.object.esfera.grid.')).toEqual(['angle']);
  });
  it('know mouse, custom, this, and element only inside Each', () => {
    expect(labels('scene.mouse.pos')).toEqual(['posX', 'posY']);
    expect(labels('scene.custom.')).toEqual(['speed']);
    expect(labels('this.inn')).toEqual(['innerRadius']);
    expect(labels('ele')).toBeUndefined();
    expect(labels('ele', { ...scope, element: true })).toEqual(['element']);
  });
  it('offer functions with their parenthesis, matching inside the name too', () => {
    const smooth = completionsAt('max(1, smo', scope);
    expect(smooth?.items.map((i) => i.insert)).toEqual(['smoothstep(', 'smooth(']);
    expect(labels('step')?.slice(0, 2)).toEqual(['step(edge, x)', 'smoothstep(a, b, x)']);
  });
  it('stay quiet after a number, an operator, or a finished name', () => {
    expect(completionsAt('scene.time * 1.', scope)).toBeNull();
    expect(completionsAt('scene.time + ', scope)).toBeNull();
    expect(completionsAt('scene.time', scope)).toBeNull();
  });
});
