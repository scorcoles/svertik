import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeSceneVariables, evaluateExpression, evaluateSceneExpressions, evaluateSceneVariables, validateExpression, createPlayer, type Engine, type SceneV1 } from '../src';

const base = { time: 0, frame: 0, fps: 30, duration: 10, progress: 0, seedGenerator: 1, custom: {} };
const scene = (formula: string, document: SceneV1['document'] = { width: 900, height: 1400 }, extra: Partial<SceneV1> = {}): SceneV1 => ({
  version: 1, document, ...extra,
  objects: [{ kind: 'shape', id: 'r', name: 'R', shape: 'rectangle', params: { width: { $expr: formula, fallback: -1 } }, stack: [] }],
});
const widthOf = (s: SceneV1) => (evaluateSceneExpressions(s).objects[0] as unknown as { params: { width: number } }).params.width;

describe('scene.aspect, dt, scroll, pixelRatio, clock.*', () => {
  it('parse; a wrong clock field is rejected', () => {
    for (const f of ['aspect', 'dt', 'scroll', 'pixelRatio', 'clock.hour', 'clock.minute', 'clock.second']) expect(validateExpression(`scene.${f}`), f).toBeNull();
    expect(validateExpression('scene.clock.day')).toMatch(/clock field/);
    expect(validateExpression('scene.clock')).not.toBeNull();
  });

  it('aspect is width / height (0 with no document); the rest are neutral until a player supplies them', () => {
    expect(evaluateExpression('scene.aspect', { ...base, width: 900, height: 1400 })).toBeCloseTo(900 / 1400);
    expect(evaluateExpression('scene.aspect', base)).toBe(0);
    expect(widthOf(scene('scene.aspect * 1400'))).toBeCloseTo(900);
    // a headless render: dt is one frame, the page has not scrolled, density 1, and the clock is not "now"
    expect(widthOf(scene('scene.dt * 1000', { width: 1, height: 1 }, { animation: { duration: 1, fps: 50, tracks: [] } }))).toBeCloseTo(20);
    expect(widthOf(scene('scene.scroll + scene.pixelRatio * 10 + scene.clock.hour'))).toBe(10);
  });

  it('read the runtime a player puts on the scene', () => {
    const s = scene('scene.dt * 100 + scene.scroll * 10 + scene.pixelRatio + scene.clock.hour * 1000 + scene.clock.minute * 0.01 + scene.clock.second * 0.0001', undefined, { runtime: { dt: 0.5, scroll: 0.2, pixelRatio: 2, hour: 7, minute: 30, second: 15 } });
    expect(widthOf(s)).toBeCloseTo(50 + 2 + 2 + 7000 + 0.3 + 0.0015, 4);
  });

  it('describeSceneVariables lists them, letting the player override the runtime', () => {
    const all = describeSceneVariables(evaluateSceneVariables(scene('1'), 0), undefined, { dt: 0.016, hour: 9 });
    expect(all).toMatchObject({ dt: 0.016, 'clock.hour': 9, aspect: 900 / 1400, pixelRatio: 1, scroll: 0 });
    for (const name of ['clock.minute', 'clock.second', 'mouse.rightDown', 'mouse.middleDown', 'mouse.clicks', 'mouse.clickMs', 'mouse.wheel']) expect(Object.keys(all)).toContain(name);
  });
});

describe('the player supplies them', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  const setup = (formula: string, options: Parameters<typeof createPlayer>[3] = {}) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.assign(svg, { getScreenCTM: () => ({ inverse: () => ({}) }) });
    vi.stubGlobal('DOMPoint', class { constructor(public x: number, public y: number) {} matrixTransform() { return { x: this.x, y: this.y }; } });
    let scheduled: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { scheduled = fn; return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    let drawn: SceneV1 | undefined;
    const engine = { mount: () => ({ update: (f: SceneV1) => { drawn = f; }, doc: () => ({ geometry: { viewBox: [0, 0, 100, 100] } }) }) } as unknown as Engine;
    const player = createPlayer(engine, svg, scene(formula), options);
    return { svg, player, frame: (t: number) => scheduled!(t), drawn: () => drawn! };
  };
  const fire = (svg: SVGSVGElement, type: string, init: Record<string, unknown> = {}) => {
    const e = new (type === 'wheel' ? WheelEvent : type === 'click' ? MouseEvent : PointerEvent)(type, { clientX: 5, clientY: 5, ...init });
    for (const [k, v] of Object.entries(init)) Object.defineProperty(e, k, { value: v });
    svg.dispatchEvent(e);
  };

  it('counts clicks, tracks the wheel and the secondary buttons, and measures time since the last click', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { svg, player, frame, drawn } = setup('scene.mouse.clicks + scene.mouse.wheel + scene.mouse.clickMs + scene.mouse.rightDown');
    frame(1000);
    expect(drawn().pointer).toMatchObject({ clicks: 0, clickMs: 0, wheel: 0, rightDown: 0, middleDown: 0 });
    fire(svg, 'click', { button: 0 }); frame(1100);
    fire(svg, 'click', { button: 2 }); frame(1100);                       // a right click is not a click
    expect(drawn().pointer!.clicks).toBe(1);
    frame(1400);
    expect(drawn().pointer!.clickMs).toBeCloseTo(400, -1);                // keeps counting while nothing else happens
    fire(svg, 'wheel', { deltaY: 250 }); frame(1450);
    fire(svg, 'wheel', { deltaY: -50 }); frame(1500);
    expect(drawn().pointer!.wheel).toBeCloseTo(2);
    fire(svg, 'pointermove', { buttons: 2 }); frame(1550);
    expect(drawn().pointer).toMatchObject({ rightDown: 1, middleDown: 0, down: 0 });
    fire(svg, 'pointermove', { buttons: 4 }); frame(1600);
    expect(drawn().pointer).toMatchObject({ rightDown: 0, middleDown: 1 });
    player.stop();
  });

  it('feeds dt, the real clock, density and page scroll, only when a formula reads them', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 17, 13, 45, 30, 500));
    vi.stubGlobal('devicePixelRatio', 3);
    const { player, frame, drawn } = setup('scene.dt + scene.clock.hour + scene.pixelRatio + scene.scroll');
    frame(0); frame(16.7);
    expect(drawn().runtime).toMatchObject({ hour: 13, minute: 45, pixelRatio: 3 });
    expect(drawn().runtime!.second).toBeCloseTo(30.5, 1);
    expect(drawn().runtime!.dt).toBeCloseTo(0.0167, 3);
    player.stop();
    // no formula, no runtime on the frame
    const quiet = setup('scene.time');
    quiet.frame(0); quiet.frame(16);
    expect(quiet.drawn().runtime).toBeUndefined();
    quiet.player.stop();
  });

  it('hands runtime and pointer to onFrame while the host asks for them (a debug panel)', () => {
    let on = false;
    const seen: { runtime?: boolean; pointer?: boolean }[] = [];
    const { player, frame } = setup('scene.time', { pointer: () => on, onFrame: ({ pointer, runtime }) => seen.push({ pointer: !!pointer, runtime: !!runtime }) });
    frame(0);
    expect(seen.at(-1)).toEqual({ pointer: false, runtime: false });
    on = true; frame(100);
    expect(seen.at(-1)).toEqual({ pointer: true, runtime: true });
    player.stop();
  });
});
