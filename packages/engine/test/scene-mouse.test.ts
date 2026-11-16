import { describe, expect, it, vi } from 'vitest';
import { builtins, createEngine, createPlayer, evaluateExpression, evaluateSceneExpressions, validateExpression, type Engine, type SceneV1 } from '../src';

const base = { time: 0, frame: 0, fps: 30, duration: 10, progress: 0, seedGenerator: 1, custom: {} };
const rect = (x: unknown): SceneV1 => ({
  version: 1, document: { width: 400, height: 200 },
  objects: [{ kind: 'shape', id: 'r', name: 'R', shape: 'rectangle', params: { width: 10, height: 10 }, stack: [], transform: { x } as never }],
});

describe('scene.mouse.*', () => {
  it('parses its fields and rejects anything else', () => {
    for (const f of ['posX', 'posY', 'fracX', 'fracY', 'down', 'inside']) expect(validateExpression(`scene.mouse.${f}`)).toBeNull();
    expect(validateExpression('scene.mouse.speed')).toMatch(/pointer field/);
    expect(validateExpression('scene.mouse')).not.toBeNull();
  });

  it('reads the live values, and neutral ones before the pointer has moved', () => {
    expect(evaluateExpression('scene.mouse.posX + 2 * scene.mouse.fracY', { ...base, mouse: { posX: 10, fracY: 0.25 } })).toBeCloseTo(10.5);
    expect(evaluateExpression('scene.mouse.fracX', base)).toBe(0.5);
    expect(evaluateExpression('scene.mouse.down + scene.mouse.inside', base)).toBe(0);
  });

  it('resolves in a scene from its runtime pointer, and defaults to the document centre', () => {
    const s = rect({ $expr: 'scene.mouse.posX * 2', fallback: 0 }) as SceneV1;
    (s.objects[0] as { params: Record<string, unknown> }).params.width = { $expr: 'scene.mouse.posX', fallback: 1 };
    const none = evaluateSceneExpressions(s).objects[0] as { params: { width: number } };
    expect(none.params.width).toBe(0);
    const moved = evaluateSceneExpressions({ ...s, pointer: { posX: 30 } }).objects[0] as { params: { width: number } };
    expect(moved.params.width).toBe(30);
    const off = evaluateSceneExpressions({ ...s, document: { width: 400, height: 200, x: 50 } }).objects[0] as { params: { width: number } };
    expect(off.params.width).toBe(50);
  });

  it('is fed by the player: moves, presses, leaves, and stops listening', () => {
    const s = rect(0);
    (s.objects[0] as { params: Record<string, unknown> }).params.width = { $expr: 'scene.mouse.posX + 100 * scene.mouse.inside + 1000 * scene.mouse.down', fallback: 1 };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.assign(svg, { getScreenCTM: () => ({ inverse: () => ({}) }) });
    vi.stubGlobal('DOMPoint', class { constructor(public x: number, public y: number) {} matrixTransform() { return { x: this.x / 2, y: this.y / 2 }; } });
    let scheduled: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { scheduled = fn; return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    let drawn: SceneV1 | undefined;
    const engine = { mount: () => ({ update: (f: SceneV1) => { drawn = f; }, doc: () => ({ geometry: { viewBox: [-100, -50, 200, 100] } }) }) } as unknown as Engine;
    const move = (type: string, x: number, y: number, buttons = 0) => {
      const e = new PointerEvent(type, { clientX: x, clientY: y, buttons });
      Object.defineProperties(e, { clientX: { value: x }, clientY: { value: y }, buttons: { value: buttons } });
      svg.dispatchEvent(e);
      scheduled!(performance.now() + 50);
    };
    try {
      const player = createPlayer(engine, svg, s);
      scheduled!(performance.now());
      expect(drawn!.pointer).toMatchObject({ inside: 0, down: 0 });
      move('pointermove', 80, 20);
      expect(drawn!.pointer).toMatchObject({ posX: 40, posY: 10, inside: 1, down: 0 });
      expect(drawn!.pointer!.fracX).toBeCloseTo(0.7);
      expect(drawn!.pointer!.fracY).toBeCloseTo(0.6);
      move('pointerdown', 80, 20, 1);
      expect(drawn!.pointer!.down).toBe(1);
      svg.dispatchEvent(new PointerEvent('pointerleave'));
      scheduled!(performance.now() + 100);
      expect(drawn!.pointer).toMatchObject({ inside: 0, down: 0, posX: 40 });
      player.stop();
      const before = drawn;
      svg.dispatchEvent(new PointerEvent('pointermove', { clientX: 4, clientY: 4 }));
      expect(drawn).toBe(before);
    } finally { vi.unstubAllGlobals(); }
  });

  it('does not track the pointer when no formula reads it', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const add = vi.spyOn(svg, 'addEventListener');
    const player = createPlayer(createEngine(builtins), svg, rect(0));
    expect(add.mock.calls.some(([type]) => type === 'pointermove')).toBe(false);
    player.stop();
  });
});
