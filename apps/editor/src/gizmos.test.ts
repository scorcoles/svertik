import { describe, expect, it } from 'vitest';
import { gizmoFor } from './gizmos';

const box = { x: 0, y: 0, width: 200, height: 100 };

describe('gizmos', () => {
  it('spherize: esfera de tres elipses y tirador de radio en el borde', () => {
    const g = gizmoFor('spherize', { center: [0.5, 0.5], radius: 0.5, strength: 0.5 }, box)!;
    expect(g.lines).toHaveLength(3);
    expect(g.handles[0]!.at).toEqual([200, 50]);
    // Arrastrar el tirador a 50 px del centro: radio = 50 / 200.
    expect(g.handles[0]!.drag({}, [200, 50], [150, 50], false)).toEqual({ radius: 0.25 });
  });

  it('rotate3d: el anillo Z gira con el puntero alrededor del pivote (⇧ = pasos de 15°)', () => {
    const g = gizmoFor('rotate3d', { rotateX: 0, rotateY: 0, rotateZ: 10, pivot: [0.5, 0.5] }, box)!;
    const z = g.lines.find((l) => l.tone === 'z')!;
    expect(z.drag!({ rotateZ: 10 }, [150, 50], [100, 100], false)).toEqual({ rotateZ: 100 });
    expect(z.drag!({ rotateZ: 10 }, [150, 50], [100, 100], true)).toEqual({ rotateZ: 105 });
  });

  it('rotate3d: arrastrar por dentro inclina en X e Y a la vez (bola de rastreo)', () => {
    const g = gizmoFor('rotate3d', { rotateX: 0, rotateY: 0, rotateZ: 0, pivot: [0.5, 0.5] }, { x: 0, y: 0, width: 100, height: 100 })!;
    const ball = g.lines.find((l) => l.area)!;
    // R = 38: 90° por cada 76 px. Hacia abajo, X baja (lo de arriba viene hacia delante); a la derecha, Y sube.
    expect(ball.drag!({ rotateX: 0, rotateY: 0 }, [50, 50], [50 + 38, 50 + 38], false)).toEqual({ rotateX: -45, rotateY: 45 });
  });

  it('wave: el tirador cambia la amplitud en perpendicular a la dirección', () => {
    const g = gizmoFor('wave', { amplitude: 0.05, wavelength: 0.5, phase: 0, direction: 0 }, box)!;
    expect(g.handles[0]!.drag({ amplitude: 0.05 }, [0, 0], [0, 20], false)).toEqual({ amplitude: 0.15 });
  });

  it('sin gizmo para efectos que no lo tienen', () => {
    expect(gizmoFor('noise', {}, box)).toBeNull();
  });
});

it('gravity: mueve el suelo y gira con ajuste angular', () => {
  const g = gizmoFor('gravity', {}, box)!;
  expect(g.handles[0]!.at).toEqual([100, 150]);
  expect(g.lines[0]!.drag!({}, [100, 150], [120, 160], false)).toEqual({ floor: [0.6, 1.6] });
  expect(g.handles[1]!.drag!({}, [300, 150], [100, 350], true)).toEqual({ rotation: 90 });
});

it('particles: dirección y tamaño del emisor se pueden arrastrar', () => {
  const g = gizmoFor('particles', { center: [0.5, 0.5], emitter: 'box', area: [0.2, 0.4] }, box)!;
  expect(g.lines[0]!.closed).toBe(true);
  expect(g.handles.find((h) => h.label === 'Direction')!.drag({}, [100, 0], [150, 50], false)).toEqual({ direction: 0 });
  expect(g.handles.find((h) => h.label === 'Emitter area')!.drag({}, [120, 70], [150, 80], false)).toEqual({ area: [0.5, 0.6] });
});


it('Clone radial muestra cada anillo y permite arrastrar su separación', () => {
  const g = gizmoFor('clone', { mode: 'radial', radius: 1, rings: 3, ringSpacing: 0.5 }, box)!;
  expect(g.lines).toHaveLength(3);
  expect(g.handles.find((h) => h.label === 'Ring spacing')!.drag({}, [100, 350], [100, 450], false)).toEqual({ ringSpacing: 1 });
  expect(gizmoFor('clone', { mode: 'radial', radius: 1 }, box)!.handles).toHaveLength(1);
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
