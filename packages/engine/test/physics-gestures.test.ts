// Click push and Double-click burst in the player: the clicks of one double-click are one gesture.
import { expect, it, vi } from 'vitest';
import { createPlayer, type Engine, type SceneV1 } from '../src';

const scene = (): SceneV1 => ({
  version: 1, document: { width: 800, height: 600 }, animation: { duration: 10, infinite: true, loop: false, fps: 30, tracks: [] },
  objects: [{
    kind: 'group', id: 'g', name: 'World',
    stack: [{ id: 'ph', type: 'physics', params: { time: { $expr: 'scene.time', fallback: 0 }, poke: 600, burst: 6, drag: true } }],
    children: [
      { kind: 'instance', id: 'gen', name: 'Gen', of: 'ball', stack: [], mouse: { event: 'click' } },
      { kind: 'shape', id: 'ball', name: 'Ball', shape: 'ellipse', params: { width: 60, height: 60 }, stack: [] },
    ],
  }],
});

it('a double-click whose first click pushed the body away bursts it and makes no copy', () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const body = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  body.setAttribute('data-node', 'ball');
  svg.appendChild(body);
  Object.assign(svg, { getScreenCTM: () => ({ inverse: () => ({}) }) });
  vi.stubGlobal('DOMPoint', class { constructor(public x: number, public y: number) {} matrixTransform() { return { x: this.x, y: this.y }; } });
  let scheduled: FrameRequestCallback | undefined;
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { scheduled = fn; return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  let drawn: SceneV1 | undefined;
  // The ball as drawn: a body a click can push and a double-click can burst.
  const ball = { node: 'ball', pokeable: true, burstable: true, draggable: true, style: {}, subpaths: [{ closed: true, start: [-30, -30], segs: [{ c1: [30, -30], c2: [30, -30], p: [30, -30] }, { c1: [30, 30], c2: [30, 30], p: [30, 30] }, { c1: [-30, 30], c2: [-30, 30], p: [-30, 30] }] }] };
  const engine = { mount: () => ({ update: (frame: SceneV1) => { drawn = frame; }, doc: () => ({ geometry: { viewBox: [0, 0, 800, 600], shapes: [ball] }, nodes: new Map() }) }) } as unknown as Engine;
  const click = (target: Element, detail: number, x: number) => {
    const e = new MouseEvent('click', { bubbles: true, detail, button: 0 });
    Object.defineProperties(e, { clientX: { value: x }, clientY: { value: 0 }, detail: { value: detail } });
    target.dispatchEvent(e);
  };
  try {
    const player = createPlayer(engine, svg, scene());
    click(body, 1, 10);                  // on the ball: a push
    click(svg, 2, 14);                   // the ball moved away: still the same gesture
    const double = new MouseEvent('dblclick', { bubbles: true });
    Object.defineProperties(double, { clientX: { value: 14 }, clientY: { value: 0 } });
    svg.dispatchEvent(double);           // on empty canvas, but it began on the ball
    scheduled!(performance.now());
    expect(drawn!.pokes).toHaveLength(1);
    expect(drawn!.bursts?.map((b) => b.node)).toEqual(['ball']);
    // No Mouse Instance copy from any of those clicks.
    const copies = JSON.stringify(drawn!.objects).match(/@mouse-gen/g) ?? [];
    expect(copies).toHaveLength(0);
    // A click elsewhere, later, is a plain click again: it makes a copy.
    vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 2000);
    click(svg, 1, 300);
    scheduled!(performance.now());
    expect(JSON.stringify(drawn!.objects).match(/@mouse-gen-\d+"/g)?.length ?? 0).toBeGreaterThan(0);
    player.stop();
  } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});

it('pressing on a body and moving drags it; letting go is not a click', () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const body = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  body.setAttribute('data-node', 'ball');
  svg.appendChild(body);
  Object.assign(svg, { getScreenCTM: () => ({ inverse: () => ({}) }) });
  vi.stubGlobal('DOMPoint', class { constructor(public x: number, public y: number) {} matrixTransform() { return { x: this.x, y: this.y }; } });
  let scheduled: FrameRequestCallback | undefined;
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { scheduled = fn; return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  let drawn: SceneV1 | undefined;
  const ball = { node: 'ball', draggable: true, pokeable: true, style: {}, subpaths: [] };
  const engine = { mount: () => ({ update: (frame: SceneV1) => { drawn = frame; }, doc: () => ({ geometry: { viewBox: [0, 0, 800, 600], shapes: [ball] }, nodes: new Map() }) }) } as unknown as Engine;
  const pointer = (type: string, target: Element, x: number) => {
    const e = new MouseEvent(type, { bubbles: true, button: 0 });
    Object.defineProperties(e, { clientX: { value: x }, clientY: { value: 0 }, pointerId: { value: 1 }, detail: { value: 1 } });
    target.dispatchEvent(e);
  };
  try {
    const player = createPlayer(engine, svg, scene());
    pointer('pointerdown', body, 0);
    pointer('pointermove', svg, 2);    // not yet: under 5 px
    pointer('pointermove', svg, 40);
    pointer('pointermove', svg, 80);
    pointer('pointerup', svg, 80);
    pointer('click', svg, 80);         // the end of the drag: no push, no copy
    scheduled!(performance.now());
    expect(drawn!.drags).toHaveLength(1);
    expect(drawn!.drags![0]!.node).toBe('ball');
    expect(drawn!.drags![0]!.points.map((p) => p.x)).toEqual([0, 40, 80, 80]);
    expect(drawn!.drags![0]!.end).toBeDefined();
    expect(drawn!.pokes ?? []).toHaveLength(0);
    expect(JSON.stringify(drawn!.objects).match(/@mouse-gen/g) ?? []).toHaveLength(0);
    player.stop();
  } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});

it('on a touch screen two quick taps on a body burst it (no dblclick needed) and make no copy', () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const body = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  body.setAttribute('data-node', 'ball');
  svg.appendChild(body);
  Object.assign(svg, { getScreenCTM: () => ({ inverse: () => ({}) }) });
  vi.stubGlobal('DOMPoint', class { constructor(public x: number, public y: number) {} matrixTransform() { return { x: this.x, y: this.y }; } });
  let scheduled: FrameRequestCallback | undefined;
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { scheduled = fn; return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  let drawn: SceneV1 | undefined;
  const ball = { node: 'ball', pokeable: true, burstable: true, draggable: true, body: 'ball#0', style: {}, subpaths: [{ closed: true, start: [-30, -30], segs: [{ c1: [30, -30], c2: [30, -30], p: [30, -30] }, { c1: [30, 30], c2: [30, 30], p: [30, 30] }, { c1: [-30, 30], c2: [-30, 30], p: [-30, 30] }] }] };
  const engine = { mount: () => ({ update: (frame: SceneV1) => { drawn = frame; }, doc: () => ({ geometry: { viewBox: [0, 0, 800, 600], shapes: [ball] }, nodes: new Map() }) }) } as unknown as Engine;
  const tap = (target: Element, x: number) => {
    const down = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    Object.defineProperties(down, { clientX: { value: x }, clientY: { value: 0 }, pointerId: { value: 1 }, pointerType: { value: 'touch' } });
    target.dispatchEvent(down);
    const up = new MouseEvent('pointerup', { bubbles: true, button: 0 });
    Object.defineProperties(up, { clientX: { value: x }, clientY: { value: 0 }, pointerId: { value: 1 }, pointerType: { value: 'touch' } });
    target.dispatchEvent(up);
    const click = new MouseEvent('click', { bubbles: true, button: 0 });
    Object.defineProperties(click, { clientX: { value: x }, clientY: { value: 0 }, detail: { value: 1 } });
    target.dispatchEvent(click);
  };
  try {
    const player = createPlayer(engine, svg, scene());
    expect(svg.style.touchAction).toBe('none');
    tap(body, 10);   // pushes the ball
    tap(svg, 14);    // the ball moved away: the second tap of the same gesture
    scheduled!(performance.now());
    expect(drawn!.pokes).toHaveLength(1);
    expect(drawn!.bursts?.map((b) => b.body)).toEqual(['ball#0']);
    expect(JSON.stringify(drawn!.objects).match(/@mouse-gen/g) ?? []).toHaveLength(0);
    player.stop();
    expect(svg.style.touchAction).toBe('');
  } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});
