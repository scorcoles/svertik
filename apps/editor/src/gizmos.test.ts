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
