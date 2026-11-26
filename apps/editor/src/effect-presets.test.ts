import { describe, expect, it } from 'vitest';
import { builtins, createEngine, validateScene, type ParamSpec, type SceneV1 } from '@svertik/engine';
import { EFFECT_PRESETS, matchesPreset, presetValues } from './effect-presets';

const registry = new Map(builtins.map((m) => [m.type, m]));
const schemaOf = (type: string) => registry.get(type)!.params as Record<string, ParamSpec>;

describe('effect presets', () => {
  it('every preset names real parameters of a real effect, and renders', () => {
    const engine = createEngine(builtins);
    for (const [type, presets] of Object.entries(EFFECT_PRESETS)) {
      const schema = schemaOf(type);
      expect(schema, type).toBeTruthy();
      for (const preset of presets) {
        for (const name of Object.keys(preset.params)) expect(schema[name], `${type} › ${preset.name} › ${name}`).toBeTruthy();
        const scene: SceneV1 = { version: 1, objects: [{ kind: 'shape', id: 's', name: 'S', shape: 'star', params: {}, stack: [{ id: 'e', type, params: presetValues(schema, {}, preset) }] }] };
        expect(validateScene(scene).errors, `${type} › ${preset.name}`).toEqual([]);
        expect(engine.evaluateDocument({ ...scene, at: 1.2 }).geometry.shapes.length, `${type} › ${preset.name}`).toBeGreaterThan(0);
      }
    }
  });

  it('applying one resets the rest to defaults but keeps the place and links (centre, seed, clock)', () => {
    const schema = schemaOf('twist');
    const values = presetValues(schema, { angle: 33, radius: 1.9, center: [0.2, 0.8] }, EFFECT_PRESETS.twist![0]!);
    expect(values.angle).toBe(180);
    expect(values.radius).toBe(0.8);
    expect(values.center).toEqual([0.2, 0.8]);
    const crack = presetValues(schemaOf('crack'), { seed: 9, jagged: 0.99 }, EFFECT_PRESETS.crack![1]!);
    expect(crack.seed).toBe(9);
    expect(crack.jagged).toBe(0.4);
  });

  it('marks the preset the effect is set to, and none once a value is changed', () => {
    const schema = schemaOf('wave');
    const flag = EFFECT_PRESETS.wave![0]!;
    const values = presetValues(schema, {}, flag);
    expect(matchesPreset(schema, values, flag)).toBe(true);
    expect(matchesPreset(schema, values, EFFECT_PRESETS.wave![1]!)).toBe(false);
    expect(matchesPreset(schema, { ...values, amplitude: 0.3 }, flag)).toBe(false);
  });
});

describe('generator presets (Random wave, Random bars)', () => {
  it('name real values, render, and keep size, style, seed and clock', async () => {
    const { shapeRegistry } = await import('@svertik/engine');
    const { SHAPE_PRESETS, keptByShapes } = await import('./effect-presets');
    const engine = createEngine(builtins);
    for (const [shape, presets] of Object.entries(SHAPE_PRESETS)) {
      const schema = shapeRegistry.get(shape)!.params as Record<string, ParamSpec>;
      for (const preset of presets) {
        for (const name of Object.keys(preset.params)) expect(schema[name], `${shape} › ${preset.name} › ${name}`).toBeTruthy();
        const params = presetValues(schema, { width: 400, fillColor: '#ff0000', seed: 7, time: { $expr: 'scene.time', fallback: 0 } }, preset, keptByShapes);
        expect(params.width).toBe(400);
        expect(params.fillColor).toBe('#ff0000');
        expect(params.seed).toBe(7);
        expect(params.time).toEqual({ $expr: 'scene.time', fallback: 0 });
        const scene = { version: 1, objects: [{ kind: 'shape', id: 's', name: 'S', shape, params, stack: [] }] } as SceneV1;
        expect(engine.evaluateDocument({ ...scene, at: 1.2 }).geometry.shapes.length, `${shape} › ${preset.name}`).toBeGreaterThan(0);
      }
    }
  });
});
