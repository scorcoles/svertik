import { describe, expect, it, vi } from 'vitest';
import { builtins, createEngine, createMouseInstances, createPlayer, evaluateExpression, evaluateSceneExpressions, validateExpression, walkNodes, type Engine, type GroupNode, type SceneV1, type ShapeNode } from '../src';

const base = { time: 0, frame: 0, fps: 30, duration: 10, progress: 0, seedGenerator: 1, custom: {} };
const rect = (x: unknown): SceneV1 => ({
  version: 1, document: { width: 400, height: 200 },
  objects: [{ kind: 'shape', id: 'r', name: 'R', shape: 'rectangle', params: { width: 10, height: 10 }, stack: [], transform: { x } as never }],
});

describe('scene.mouse.*', () => {
  it('parses its fields and rejects anything else', () => {
    for (const f of ['posX', 'posY', 'fracX', 'fracY', 'down', 'inside', 'velX', 'velY', 'downMs']) expect(validateExpression(`scene.mouse.${f}`)).toBeNull();
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
    const none = evaluateSceneExpressions(s).objects[0] as ShapeNode;
    expect(none.params.width).toBe(0);
    const moved = evaluateSceneExpressions({ ...s, pointer: { posX: 30 } }).objects[0] as ShapeNode;
    expect(moved.params.width).toBe(30);
    const off = evaluateSceneExpressions({ ...s, document: { width: 400, height: 200, x: 50 } }).objects[0] as ShapeNode;
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

  it('measures speed and how long the button was held (kept after release)', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.assign(svg, { getScreenCTM: () => ({ inverse: () => ({}) }) });
    vi.stubGlobal('DOMPoint', class { constructor(public x: number, public y: number) {} matrixTransform() { return { x: this.x, y: this.y }; } });
    let scheduled: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { scheduled = fn; return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    let drawn: SceneV1 | undefined;
    const engine = { mount: () => ({ update: (f: SceneV1) => { drawn = f; }, doc: () => ({ geometry: { viewBox: [0, 0, 100, 100] } }) }) } as unknown as Engine;
    let clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const fire = (type: string, x: number, y: number, buttons: number) => {
      const e = new PointerEvent(type, { clientX: x, clientY: y, buttons });
      Object.defineProperties(e, { clientX: { value: x }, clientY: { value: y }, buttons: { value: buttons } });
      svg.dispatchEvent(e);
    };
    const s = rect(0);
    (s.objects[0] as { params: Record<string, unknown> }).params.width = { $expr: 'scene.mouse.velX + scene.mouse.downMs', fallback: 1 };
    try {
      const player = createPlayer(engine, svg, s);
      scheduled!(clock);
      fire('pointermove', 0, 0, 0);
      clock += 20; fire('pointermove', 10, 0, 0);          // 500 px/s, smoothed towards it
      scheduled!(clock);
      expect(drawn!.pointer!.velX).toBeGreaterThan(100);
      expect(drawn!.pointer!.velX).toBeLessThanOrEqual(500);
      expect(drawn!.pointer!.velY).toBeCloseTo(0);
      clock += 5; fire('pointerdown', 10, 0, 1);
      clock += 300; scheduled!(clock);                     // still held: counts while no event arrives
      expect(drawn!.pointer!.down).toBe(1);
      expect(drawn!.pointer!.downMs).toBeCloseTo(300, -1);
      clock += 100; fire('pointerup', 10, 0, 0);
      expect(drawn!.pointer!.downMs).toBeCloseTo(300, -1);
      scheduled!(clock);
      expect(drawn!.pointer!.down).toBe(0);
      expect(drawn!.pointer!.downMs).toBeCloseTo(400, -1); // the last press lasted 400 ms, and stays
      clock += 2000; scheduled!(clock);
      expect(drawn!.pointer!.velX).toBe(0);                // it coasted to a stop
      expect(drawn!.pointer!.downMs).toBeCloseTo(400, -1);
      player.stop();
    } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); }
  });

  it('lets a Mouse Instance read the pointer at the event (hold time on release)', () => {
    const s: SceneV1 = {
      version: 1, document: { width: 800, height: 600 },
      objects: [
        { kind: 'instance', id: 'mouse', name: 'Mouse', of: 'source', stack: [], mouse: { event: 'click', scale: { $expr: '1 + scene.mouse.downMs / 1000', fallback: 1 }, offset: [{ $expr: 'scene.mouse.posX / 10', fallback: 0 }, 0] } },
        { kind: 'shape', id: 'source', name: 'Source', shape: 'rectangle', visible: false, params: { width: 20, height: 10 }, stack: [] },
      ],
    };
    const m = createMouseInstances(s);
    m.event('click', [200, 100], 10, 0, 0, null, { posX: 200, downMs: 1500 });
    const copy = [...walkNodes(m.apply({ ...s, pointer: { posX: 200, downMs: 1500 } }, 10).objects)].map(({ node }) => node).find((n) => n.id.startsWith('@mouse-')) as GroupNode;
    expect(copy.transform).toMatchObject({ scale: 2.5, x: 220, y: 100 });
  });

  it('tracks the pointer for onFrame only while the host asks for it, even if no formula reads it', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.assign(svg, { getScreenCTM: () => ({ inverse: () => ({}) }) });
    vi.stubGlobal('DOMPoint', class { constructor(public x: number, public y: number) {} matrixTransform() { return { x: this.x, y: this.y }; } });
    let scheduled: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { scheduled = fn; return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const engine = { mount: () => ({ update: () => {}, doc: () => ({ geometry: { viewBox: [0, 0, 100, 100] } }) }) } as unknown as Engine;
    let visible = false;
    const frames: (number | undefined)[] = [];
    const move = (x: number) => {
      const e = new PointerEvent('pointermove', { clientX: x, clientY: 5 });
      Object.defineProperties(e, { clientX: { value: x }, clientY: { value: 5 }, buttons: { value: 0 } });
      svg.dispatchEvent(e);
      scheduled?.(performance.now() + 50);
    };
    try {
      const player = createPlayer(engine, svg, rect(0), { pointer: () => visible, onFrame: ({ pointer }) => frames.push(pointer?.posX) });
      scheduled!(performance.now());
      expect(frames.at(-1)).toBeUndefined();            // panel hidden: no pointer in the frame
      const before = frames.length;
      move(30);
      expect(frames.length).toBe(before);                // and no repaint for a pointer nobody reads
      visible = true;
      move(40);
      expect(frames.at(-1)).toBe(40);                    // panel visible: the live pointer comes with the frame
      player.stop();
    } finally { vi.unstubAllGlobals(); }
  });
});
