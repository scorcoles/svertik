import { describe, expect, it } from 'vitest';
import { bounds, builtins, createEngine, createMouseInstances, sampleScene, validateScene, type GroupNode, type SceneV1 } from '../src';

const scene = (mouse: Record<string, unknown> = {}): SceneV1 => ({
  version: 1, document: { width: 800, height: 600 },
  objects: [
    { kind: 'instance', id: 'mouse', name: 'Mouse', of: 'source', stack: [], mouse },
    { kind: 'shape', id: 'source', name: 'Source', shape: 'rectangle', visible: false, params: { width: 20, height: 10 }, transform: { x: 80, y: 40 }, stack: [] },
  ],
});
const copies = (s: SceneV1) => s.objects.filter(n => n.kind === 'group') as GroupNode[];

describe('Mouse Instance', () => {
  it('draws nothing at rest, then places a hidden source at the cursor without changing the scene', () => {
    const s = scene();
    const before = JSON.stringify(s);
    const engine = createEngine(builtins);
    expect(engine.evaluateDocument(s).geometry.shapes).toHaveLength(0);
    const mouse = createMouseInstances(s);
    expect(mouse.event('click', [200, 100], 10)).toBe(true);
    const frame = mouse.apply(s, 10);
    const box = bounds(engine.evaluateDocument(frame).geometry);
    expect(box.x + box.width / 2).toBeCloseTo(200);
    expect(box.y + box.height / 2).toBeCloseTo(100);
    expect(box.width).toBeCloseTo(20);
    expect(JSON.stringify(s)).toBe(before);
    expect(validateScene(s)).toEqual({ errors: [], warnings: [] });
  });

  it.each(['click', 'double-click', 'right-click', 'middle-click', 'wheel-up', 'wheel-down'] as const)('fires %s independently', kind => {
    const s = scene({ event: kind });
    const m = createMouseInstances(s);
    expect(m.event('move', [0, 0], 0)).toBe(false);
    expect(m.event(kind, [5, 10], 1)).toBe(true);
    expect(copies(m.apply(s, 1))).toHaveLength(1);
  });

  it('limits movement by button, rate and distance, and retains only the newest copies', () => {
    const s = scene({ event: 'move', button: 'left', rate: 2, distance: 10, limit: 2, lifetime: 0 });
    const m = createMouseInstances(s);
    expect(m.event('move', [0, 0], 0, 0)).toBe(false);
    m.event('move', [0, 0], 0, 1);
    m.event('move', [20, 0], 0.1, 1);
    m.event('move', [5, 0], 1, 1);
    expect(copies(m.apply(s, 1))).toHaveLength(1);
    m.event('move', [20, 0], 1, 1);
    m.event('move', [40, 0], 2, 1);
    const out = copies(m.apply(s, 100));
    expect(out).toHaveLength(2);
    expect(out.map(n => n.transform?.x)).toEqual([40, 20]);
    m.clear();
    expect(m.active()).toBe(false);
  });

  it('expires copies and starts each animation at its own birth', () => {
    const s = scene({ lifetime: 2 });
    s.animation = { duration: 2, tracks: [{ id: 'scale', node: 'source', on: 'node', param: 'scale', keys: [{ t: 0, value: 1 }, { t: 2, value: 3 }] }] };
    const m = createMouseInstances(s);
    m.event('click', [0, 0], 0);
    m.event('click', [100, 0], 1);
    const frame = m.apply(s, 1);
    expect(copies(frame).map(n => n.composition?.params?.time)).toEqual([0, 1]);
    const engine = createEngine(builtins);
    const widths = copies(frame).map(n => bounds(engine.evaluateDocument({ ...s, objects: [n] }).geometry).width);
    expect(widths[0]).toBeCloseTo(20);
    expect(widths[1]).toBeCloseTo(40);
    expect(copies(m.apply(s, 2))).toHaveLength(1);
    expect(copies(m.apply(s, 3))).toHaveLength(0);
    expect(m.active()).toBe(false);
  });

  it('preserves a source group, hidden children and its local composition', () => {
    const s = scene();
    s.objects[1] = { kind: 'group', id: 'source', name: 'Source', visible: false, stack: [], children: [], composition: { scene: { version: 1, objects: [{ kind: 'shape', id: 'inner', name: 'Inner', shape: 'rectangle', stack: [], params: { width: 30, height: 10 } }] } } };
    const m = createMouseInstances(s);
    m.event('click', [50, 60], 0);
    const b = bounds(createEngine(builtins).evaluateDocument(m.apply(s, 0)).geometry);
    expect(b.width).toBeCloseTo(30);
    expect(b.x + b.width / 2).toBeCloseTo(50);
  });

  it('validates malformed controls and ignores missing sources', () => {
    const s = scene({ event: 'unknown', rate: NaN, offset: [0] });
    expect(validateScene(s).errors).toHaveLength(3);
    s.objects = [s.objects[0]!];
    const m = createMouseInstances(s);
    expect(m.event('click', [0, 0], 0)).toBe(false);
  });
});

// Browser event routing: empty canvas input, coordinate conversion, default prevention and cleanup.
import { vi } from 'vitest';
import { createPlayer, type Engine } from '../src';

it('routes canvas events through the player and releases listeners on stop', () => {
  const s = scene({ event: 'wheel-up' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  Object.assign(svg, { getScreenCTM: () => ({ inverse: () => ({}) }) });
  vi.stubGlobal('DOMPoint', class {
    constructor(public x: number, public y: number) {}
    matrixTransform() { return { x: this.x / 2, y: this.y / 2 }; }
  });
  let scheduled: FrameRequestCallback | undefined;
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { scheduled = fn; return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  let drawn: SceneV1 | undefined;
  const engine = { mount: () => ({ update: (frame: SceneV1) => { drawn = frame; }, doc: () => null }) } as unknown as Engine;
  try {
    const player = createPlayer(engine, svg, s);
    const event = new WheelEvent('wheel', { deltaY: -10, clientX: 100, clientY: 80, cancelable: true });
    Object.defineProperties(event, { clientX: { value: 100 }, clientY: { value: 80 } });
    svg.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    scheduled!(performance.now());
    expect(copies(drawn!)[0]!.transform).toMatchObject({ x: 50, y: 40 });
    const down = new WheelEvent('wheel', { deltaY: 10, cancelable: true });
    svg.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
    player.stop();
    const after = new WheelEvent('wheel', { deltaY: -10, cancelable: true });
    svg.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  } finally { vi.unstubAllGlobals(); }
});

it('evaluates Mouse formulas at scene time per event and freezes each emitted copy', () => {
  const expr = ($expr: string, fallback = 0) => ({ $expr, fallback });
  const s = scene({
    count: expr('2.9', 1), lifetime: expr('1 + scene.time / 180', 3),
    scale: expr('scene.custom.size', 1), rotation: expr('10 * scene.cycle'),
    offset: [expr('scene.time'), expr('-scene.custom.size')],
  });
  s.animation = { duration: 10, infinite: true, loop: false, tracks: [] };
  s.custom = { size: expr('2 + scene.cycle / 18', 1) };
  const before = JSON.stringify(s);
  expect(validateScene(s)).toEqual({ errors: [], warnings: [] });
  const m = createMouseInstances(s, () => 0.5);
  m.event('click', [20, 30], 1000, 0, 180);
  const first = copies(m.apply(s, 1000));
  expect(first).toHaveLength(2);
  expect(first[0]!.transform).toMatchObject({ x: 200, y: 27, scale: 3, rotation: 180 });
  m.event('click', [20, 30], 1001, 0, 190);
  const second = copies(m.apply(s, 1001));
  expect(second).toHaveLength(4);
  expect(second[0]!.transform?.rotation).toBe(190);
  expect(second[2]!.transform?.rotation).toBe(180);
  expect(copies(m.apply(s, 1002))).toHaveLength(2);
  expect(JSON.stringify(s)).toBe(before);
});

it('uses formula fallbacks and safely caps counts, limits and invalid offset components', () => {
  const s = scene({
    count: { $expr: '1000', fallback: 1 }, limit: { $expr: '2', fallback: 100 },
    rotation: { $expr: 'random(0, 1, 1 / 0)', fallback: 45 },
    offset: [{ $expr: 'missing', fallback: 12 }, { $expr: '0 / 0', fallback: 8 }],
    scale: { $expr: '1 / 0', fallback: Infinity },
  });
  const m = createMouseInstances(s, () => 0.5);
  m.event('click', [0, 0], 0);
  const out = copies(m.apply(s, 0));
  expect(out).toHaveLength(2);
  expect(out[0]!.transform).toMatchObject({ x: 12, y: 8, rotation: 45, scale: 1 });
});

it('evaluates formula rate and minimum distance before accepting movement', () => {
  const s = scene({ event: 'move', rate: { $expr: '2', fallback: 20 }, distance: { $expr: '10', fallback: 0 } });
  const m = createMouseInstances(s);
  m.event('move', [0, 0], 0);
  m.event('move', [20, 0], 0.1);
  m.event('move', [5, 0], 0.5);
  expect(copies(m.apply(s, 0.5))).toHaveLength(1);
  m.event('move', [20, 0], 0.5);
  expect(copies(m.apply(s, 0.5))).toHaveLength(2);
});

it('samples random() per copy and per emission, freezing each rotation, with explicit seeds remaining shared', () => {
  const s = scene({ count: 3, lifetime: 0, rotation: { $expr: 'random(0, 90)', fallback: 0 } });
  const m = createMouseInstances(s);
  m.event('click', [0, 0], 0);
  const first = copies(m.apply(s, 0)).map(n => n.transform!.rotation!);
  expect(new Set(first).size).toBe(3);
  for (const angle of first) { expect(angle).toBeGreaterThanOrEqual(0); expect(angle).toBeLessThan(90); }
  m.event('click', [0, 0], 1);
  const second = copies(m.apply(s, 1)).map(n => n.transform!.rotation!);
  expect(new Set(second).size).toBe(6);
  expect(second.slice(3)).toEqual(first);
  expect(copies(m.apply(s, 100)).map(n => n.transform!.rotation!)).toEqual(second);
  const replay = createMouseInstances(s);
  replay.event('click', [0, 0], 0);
  expect(copies(replay.apply(s, 0)).map(n => n.transform!.rotation!)).toEqual(first);
  const seededScene = scene({ count: 3, rotation: { $expr: 'random(0, 90, 42)', fallback: 0 } });
  const seeded = createMouseInstances(seededScene);
  seeded.event('click', [0, 0], 0);
  expect(new Set(copies(seeded.apply(seededScene, 0)).map(n => n.transform!.rotation)).size).toBe(1);
});

it('gives each emitted Cross its own Paint Amount random sample, stable across frames', () => {
  const s = scene({ count: 4, lifetime: 0 });
  s.objects[1] = {
    kind: 'shape', id: 'source', name: 'Cross', shape: 'cross', visible: false,
    params: { fill: true, fillColor: '#000000' },
    stack: [{ id: 'paint', type: 'paint', params: { fillColor: '#ffffff', fillAmount: { $expr: 'random(0, 1)', fallback: 0.5 } } }],
  };
  const original = JSON.stringify(s);
  const mouse = createMouseInstances(s);
  mouse.event('click', [0, 0], 0);
  const engine = createEngine(builtins);
  const colorsAt = (time: number) => copies(mouse.apply(s, time)).map(n => engine.evaluateDocument({ ...s, objects: [n] }).geometry.shapes[0]!.style.fill);
  const initial = colorsAt(0);
  expect(new Set(initial).size).toBe(4);
  expect(colorsAt(1)).toEqual(initial);
  expect(colorsAt(100)).toEqual(initial);
  expect(JSON.stringify(s)).toBe(original);
});

it('propagates per-copy randomness through nested source compositions', () => {
  const s = scene({ count: 3 });
  s.objects[1] = { kind: 'group', id: 'source', name: 'Composition', children: [], stack: [], visible: false, composition: { scene: {
    version: 1, objects: [{ kind: 'shape', id: 'cross', name: 'Cross', shape: 'cross', params: { fillColor: '#000000' }, stack: [
      { id: 'paint', type: 'paint', params: { fillColor: '#ffffff', fillAmount: { $expr: 'random(0, 1)', fallback: 0.5 } } },
    ] }],
  } } };
  const mouse = createMouseInstances(s);
  mouse.event('click', [0, 0], 0);
  const engine = createEngine(builtins);
  const colors = copies(mouse.apply(s, 0)).filter(n => n.id !== 'source').map(n => engine.evaluateDocument({ ...s, objects: [n] }).geometry.shapes[0]!.style.fill);
  expect(new Set(colors).size).toBe(3);
});

it('chooses an exact palette color per click, shared across that emission and stable afterwards', () => {
  const palette = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'];
  const s = scene({ count: 3, lifetime: 0, limit: 100 });
  s.objects[1]!.stack = [{ id: 'colors', type: 'color', params: { mode: 'palette', palette } }];
  const before = JSON.stringify(s);
  const mouse = createMouseInstances(s);
  const engine = createEngine(builtins);
  const fill = (node: GroupNode) => engine.evaluateDocument({ ...s, objects: [node] }).geometry.shapes[0]!.style.fill;
  const choices: string[] = [];
  for (let click = 0; click < 12; click++) {
    mouse.event('click', [0, 0], click);
    const batch = copies(mouse.apply(s, click)).slice(0, 3).map(fill);
    expect(new Set(batch).size).toBe(1);
    expect(palette).toContain(batch[0]);
    choices.push(batch[0]!);
  }
  expect(new Set(choices).size).toBeGreaterThan(1);
  expect(copies(mouse.apply(s, 100)).slice(0, 3).map(fill)).toEqual([choices.at(-1), choices.at(-1), choices.at(-1)]);
  expect(JSON.stringify(s)).toBe(before);
});

it('varies Color Random per source instance without animating its color after birth', () => {
  const s = scene({ count: 3, lifetime: 0 });
  if (s.objects[1]!.kind === 'shape') s.objects[1]!.params.fillColor = '#ff6600';
  s.objects[1]!.stack = [{ id: 'colors', type: 'color', params: { mode: 'random', variation: 0.8, seed: 7 } }];
  const mouse = createMouseInstances(s);
  const engine = createEngine(builtins);
  const fills = (t: number) => copies(mouse.apply(s, t)).map(n => engine.evaluateDocument({ ...s, objects: [n] }).geometry.shapes[0]!.style.fill);
  mouse.event('click', [0, 0], 0);
  const initial = fills(0);
  expect(new Set(initial).size).toBe(3);
  expect(fills(100)).toEqual(initial);
  mouse.event('click', [0, 0], 101);
  expect(new Set(fills(101)).size).toBe(6);
});

it.each(['click', 'double-click', 'right-click', 'middle-click', 'move', 'wheel-up', 'wheel-down'] as const)('limits %s input to a hidden target covering half the scene', kind => {
  const s = scene({ event: kind, target: 'area' });
  s.objects.push({ kind: 'shape', id: 'area', name: 'Left half', shape: 'rectangle', params: { width: 400, height: 600, fill: false }, transform: { x: -200 }, visible: false, stack: [] });
  const doc = createEngine(builtins).evaluateDocument(s);
  expect(doc.geometry.shapes).toHaveLength(0);
  const m = createMouseInstances(s);
  expect(m.event(kind, [100, 0], 0, 0, 0, doc)).toBe(false);
  expect(m.event(kind, [-200, 0], 0, 0, 0, doc)).toBe(true);
  expect(copies(m.apply(s, 0))).toHaveLength(1);
  expect(m.event(kind, [-400, -300], 1, 0, 1, doc)).toBe(true);
  expect(m.event(kind, [0, 300], 2, 0, 2, doc)).toBe(true);
  expect(copies(m.apply(s, 2))).toHaveLength(3);
});

it('uses actual rotated geometry and follows an animated hidden target', () => {
  const s = scene({ target: 'area' });
  s.objects.push({ kind: 'shape', id: 'area', name: 'Diamond', shape: 'rectangle', params: { width: 100, height: 100 }, transform: { rotation: 45 }, visible: false, stack: [] });
  const engine = createEngine(builtins);
  const m = createMouseInstances(s);
  const doc = engine.evaluateDocument(s);
  expect(m.event('click', [60, 60], 0, 0, 0, doc)).toBe(false);
  expect(m.event('click', [0, 60], 0, 0, 0, doc)).toBe(true);
  s.animation = { duration: 1, tracks: [{ id: 'area-motion', node: 'area', on: 'node', param: 'x', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 1, value: 200 }] }] };
  const moved = engine.evaluateDocument(sampleScene(s, 1));
  expect(m.event('click', [0, 60], 1, 0, 1, moved)).toBe(false);
  expect(m.event('click', [200, 60], 1, 0, 1, moved)).toBe(true);
});

it('does not emit for a missing target or geometry context and warns about broken target references', () => {
  const s = scene({ target: 'missing' });
  const m = createMouseInstances(s);
  expect(m.event('click', [0, 0], 0)).toBe(false);
  expect(m.event('click', [0, 0], 0, 0, 0, createEngine(builtins).evaluateDocument(s))).toBe(false);
  expect(validateScene(s).warnings.some(w => w.includes('missing'))).toBe(true);
});
