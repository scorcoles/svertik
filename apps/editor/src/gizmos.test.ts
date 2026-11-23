import { describe, expect, it } from 'vitest';
import { gizmoFor } from './gizmos';
import { apply, invert, type Mat } from '@svertik/engine';

it('keeps the Gravity guide horizontal and its rotation drag in scene axes', () => {
  const world: Mat = [0, 2, -2, 0, 20, 30];
  const p = { floor: [0.5, 1.5], rotation: 0 };
  const g = gizmoFor('gravity', p, { x: -50, y: -20, width: 100, height: 40 }, world)!;
  const line = g.lines[0]!.pts.map((q) => apply(world, q));
  expect(line[0]![1]).toBeCloseTo(110);
  expect(line[1]![1]).toBeCloseTo(110);
  const rotation = g.handles.find((h) => h.label === 'Floor rotation')!;
  expect(rotation.drag(p, apply(invert(world), [220, 110]), apply(invert(world), [20, 310]), false)).toEqual({ rotation: 90 });
});

describe('crosshatch controls', () => {
  const bounds = { x: 0, y: 0, width: 200, height: 100 };
  it('drags offset with a comfortable travel and snaps to quarter cells', () => {
    const p = { spacing: 10, angle: 0, offset: [0.2, 0.3] };
    const g = gizmoFor('crosshatch', p, bounds)!;
    const h = g.handles.find((h) => h.label === 'Offset')!;
    expect(h.drag(p, [0, 0], [30, -60], false)).toEqual({ offset: [0.7, -0.7] });
    expect(h.drag(p, [0, 0], [1, 0], true)).toEqual({ offset: [0.25, 0.25] });
  });

  it('rotates the angle handle and adjusts spacing across the lines', () => {
    const p = { spacing: 10, angle: 0 };
    const g = gizmoFor('crosshatch', p, bounds)!;
    const angle = g.handles.find((h) => h.label === 'Angle')!;
    expect(angle.drag(p, [60, 0], [0, 60], false)).toEqual({ angle: 90 });
    const spacing = g.handles.find((h) => h.label === 'Spacing')!;
    expect(spacing.drag(p, [0, 30], [0, 60], false)).toEqual({ spacing: 20 });
    expect(spacing.drag(p, [0, 30], [0, -300], false)).toEqual({ spacing: 1 });
  });

  it('uses scene axes for fixed lines on a rotated and scaled object', () => {
    const p = { spacing: 6, angle: 0, fixLines: true };
    const g = gizmoFor('crosshatch', p, bounds, [0, 2, -2, 0, 30, 40])!;
    const offset = g.handles.find((h) => h.label === 'Offset')!;
    expect(offset.drag(p, [0, 0], [30, 0], false)).toEqual({ offset: [0, 1] });
    const spacing = g.handles.find((h) => h.label === 'Spacing')!;
    expect(spacing.drag(p, [0, 0], [9, 0], false)).toEqual({ spacing: 12 });
  });
});

const box = { x: 0, y: 0, width: 200, height: 100 };

describe('gizmos', () => {
  it('spherize: a sphere of three ellipses and a radius handle on the edge', () => {
    const g = gizmoFor('spherize', { center: [0.5, 0.5], radius: 0.5, strength: 0.5 }, box)!;
    expect(g.lines).toHaveLength(3);
    expect(g.handles[0]!.at).toEqual([200, 50]);
    // Dragging the handle 50 px from the centre: radius = 50 / 200.
    expect(g.handles[0]!.drag({}, [200, 50], [150, 50], false)).toEqual({ radius: 0.25 });
  });

  it('rotate3d: the Z ring turns with the pointer around the pivot (⇧ = 15° steps)', () => {
    const g = gizmoFor('rotate3d', { rotateX: 0, rotateY: 0, rotateZ: 10, pivot: [0.5, 0.5] }, box)!;
    const z = g.lines.find((l) => l.tone === 'z')!;
    expect(z.drag!({ rotateZ: 10 }, [150, 50], [100, 100], false)).toEqual({ rotateZ: 100 });
    expect(z.drag!({ rotateZ: 10 }, [150, 50], [100, 100], true)).toEqual({ rotateZ: 105 });
  });

  it('rotate3d: dragging inside tilts X and Y at once (trackball)', () => {
    const g = gizmoFor('rotate3d', { rotateX: 0, rotateY: 0, rotateZ: 0, pivot: [0.5, 0.5] }, { x: 0, y: 0, width: 100, height: 100 })!;
    const ball = g.lines.find((l) => l.area)!;
    // R = 38: 90° per 76 px. Down, X decreases (the top comes forward); to the right, Y increases.
    expect(ball.drag!({ rotateX: 0, rotateY: 0 }, [50, 50], [50 + 38, 50 + 38], false)).toEqual({ rotateX: -45, rotateY: 45 });
  });

  it('wave: the handle changes the amplitude across the direction', () => {
    const g = gizmoFor('wave', { amplitude: 0.05, wavelength: 0.5, phase: 0, direction: 0 }, box)!;
    expect(g.handles[0]!.drag({ amplitude: 0.05 }, [0, 0], [0, 20], false)).toEqual({ amplitude: 0.15 });
  });

  it('no gizmo for effects without one', () => {
    expect(gizmoFor('noise', {}, box)).toBeNull();
  });
});

it('gravity: moves the floor and turns with angle snapping', () => {
  const g = gizmoFor('gravity', {}, box)!;
  expect(g.handles[0]!.at).toEqual([100, 150]);
  expect(g.lines[0]!.drag!({}, [100, 150], [120, 160], false)).toEqual({ floor: [0.6, 1.6] });
  expect(g.handles[1]!.drag!({}, [300, 150], [100, 350], true)).toEqual({ rotation: 90 });
});

it('particles: the emitter\'s direction and size can be dragged', () => {
  const g = gizmoFor('particles', { center: [0.5, 0.5], emitter: 'box', area: [0.2, 0.4] }, box)!;
  expect(g.lines[0]!.closed).toBe(true);
  expect(g.handles.find((h) => h.label === 'Direction')!.drag({}, [100, 0], [150, 50], false)).toEqual({ direction: 0 });
  expect(g.handles.find((h) => h.label === 'Emitter area')!.drag({}, [120, 70], [150, 80], false)).toEqual({ area: [0.5, 0.6] });
});


it('radial Clone shows each ring and lets its spacing be dragged', () => {
  const g = gizmoFor('clone', { mode: 'radial', radius: 1, rings: 3, ringSpacing: 0.5 }, box)!;
  expect(g.lines).toHaveLength(3);
  expect(g.handles.find((h) => h.label === 'Ring spacing')!.drag({}, [100, 350], [100, 450], false)).toEqual({ ringSpacing: 1 });
  expect(gizmoFor('clone', { mode: 'radial', radius: 1 }, box)!.handles).toHaveLength(1);
});

it('compress: Start and End slide along their edges, Strength beside the middle of the center line', () => {
  const g = gizmoFor('compress', { axis: 'x', start: 0.25, end: 0.75, strength: 0.4 }, box)!;
  const [start, end, strength] = g.handles;
  expect(start!.at).toEqual([50, 0]);
  expect(end!.at).toEqual([150, 100]);
  // Middle of the center line at x = 100; 0.4 × a quarter of the 200 px box to its right.
  expect(strength!.at).toEqual([120, 50]);
  // 20 px right on a 200 px box = 0.1 of the width.
  expect(start!.drag({ start: 0.25 }, [50, 0], [70, 0], false)).toEqual({ start: 0.35 });
  expect(strength!.drag({ strength: 0.4 }, [120, 50], [130, 50], false)).toEqual({ strength: 0.6 });
  expect(gizmoFor('compress', { axis: 'y', start: 0.5, end: 0.5, strength: 0 }, box)!.handles[0]!.at).toEqual([0, 50]);
});

it('perspective: the quad and a 4 × 4 grid mapped through it', () => {
  const g = gizmoFor('perspective', { topLeft: [0, 0], topRight: [1, 0], bottomRight: [1, 1], bottomLeft: [0, 1] }, box)!;
  // Box, 6 grid lines, quad. Without distortion the middle lines cross the box at its centre.
  expect(g.lines).toHaveLength(8);
  // Lines: the box, then the grid (u = ¼, v = ¼, u = ½, v = ½, u = ¾, v = ¾), then the quad.
  const mid = g.lines.slice(1, 7).map((l) => l.pts);
  expect(mid).toContainEqual([[100, 0], [100, 100]]);
  expect(mid).toContainEqual([[0, 50], [200, 50]]);
  // Narrowing the top pulls the vertical guides together at the top, as receding lines.
  const narrow = gizmoFor('perspective', { topLeft: [0.25, 0], topRight: [0.75, 0], bottomRight: [1, 1], bottomLeft: [0, 1] }, box)!;
  const centre = narrow.lines[3]!.pts;
  expect(centre[0]![0]).toBeCloseTo(100);
  expect(centre[1]![0]).toBeCloseTo(100);
});

it('gather: a handle per edge on the middle line; dragging it along the edge sets that end', () => {
  const g = gizmoFor('gather', { axis: 'x', start: 0.4, end: -0.4 }, box)!;
  const [start, end] = g.handles;
  // Middle line: x = ½ − bias/4 of the width, at the top (start) and the bottom (end).
  expect(start!.at).toEqual([80, 0]);
  expect(end!.at).toEqual([120, 100]);
  // 10 px right on a 200 px box = 0.05 of the width → bias falls by 0.2.
  expect(start!.drag({ start: 0.4 }, [80, 0], [90, 0], false)).toEqual({ start: 0.2 });
  expect(gizmoFor('gather', { axis: 'y', start: 0.4, end: 0 }, box)!.handles[0]!.at).toEqual([0, 40]);
});
