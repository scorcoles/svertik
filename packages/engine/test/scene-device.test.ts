import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlayer, describeSceneVariables, evaluateSceneExpressions, evaluateSceneVariables, validateExpression, type Engine, type SceneV1 } from '../src';

const scene = (formula: string, extra: Partial<SceneV1> = {}): SceneV1 => ({
  version: 1, ...extra,
  objects: [{ kind: 'shape', id: 'r', name: 'R', shape: 'rectangle', params: { width: { $expr: formula, fallback: -1 } }, stack: [] }],
});
const widthOf = (s: SceneV1) => (evaluateSceneExpressions(s).objects[0] as unknown as { params: { width: number } }).params.width;

describe('scene.device.*', () => {
  it('parses tiltX, tiltY and active; rejects other fields', () => {
    for (const f of ['tiltX', 'tiltY', 'active']) expect(validateExpression(`scene.device.${f}`), f).toBeNull();
    expect(validateExpression('scene.device.shake')).toMatch(/device field/);
  });
  it('is 0 without a sensor (renders, computers) and reads what a player supplies', () => {
    expect(widthOf(scene('scene.device.tiltX + scene.device.tiltY + scene.device.active'))).toBe(0);
    expect(widthOf(scene('scene.device.tiltX * 100 + scene.device.tiltY * 10 + scene.device.active', { runtime: { tiltX: 0.5, tiltY: -0.2, deviceActive: 1 } as SceneV1['runtime'] }))).toBeCloseTo(49);
  });
  it('is listed among the variables', () => {
    expect(Object.keys(describeSceneVariables(evaluateSceneVariables(scene('1'), 0)))).toEqual(expect.arrayContaining(['device.tiltX', 'device.tiltY', 'device.active']));
  });
});

describe('the player feeds the tilt', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it('from deviceorientation, relative to how the phone was first held, clamped to −1…1', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    let scheduled: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { scheduled = fn; return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    if (!('DeviceOrientationEvent' in window)) vi.stubGlobal('DeviceOrientationEvent', class extends Event {});
    let drawn: SceneV1 | undefined;
    const engine = { mount: () => ({ update: (f: SceneV1) => { drawn = f; }, doc: () => ({ geometry: { viewBox: [0, 0, 100, 100] } }) }) } as unknown as Engine;
    const player = createPlayer(engine, svg, scene('scene.device.tiltX'));
    const tilt = (gamma: number, beta: number) => {
      const e = new Event('deviceorientation');
      Object.assign(e, { gamma, beta });
      window.dispatchEvent(e);
      scheduled?.(performance.now());
    };
    tilt(5, 50);                                     // how it is held: the rest position
    expect(drawn!.runtime).toMatchObject({ tiltX: 0, tiltY: 0, deviceActive: 1 });
    tilt(20, 35);                                    // right side down, top edge tipped away
    expect(drawn!.runtime!.tiltX).toBeCloseTo(0.5);
    expect(drawn!.runtime!.tiltY).toBeCloseTo(-0.5);
    tilt(80, 50);
    expect(drawn!.runtime!.tiltX).toBe(1);
    player.stop();
  });
});
