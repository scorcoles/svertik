import { describe, expect, it } from 'vitest';
import { bend, bounds, builtins, createEngine, noise, resolveParams, spherize, transform, twist, wave, type Scene } from '../src';

const square = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="20" y="20" width="60" height="60"/></svg>';
const scene = (stack: Scene['stack']): Scene => ({ version: 1, source: square, stack });
const engine = () => createEngine(builtins);

describe('modificadores', () => {
  it('transform desplaza', () => {
    const geo = engine().evaluate(scene([{ id: 'a', type: 'transform', params: { x: 5, y: -5 } }]));
    expect(bounds(geo)).toEqual({ x: 25, y: 15, width: 60, height: 60 });
  });

  it('transform escala alrededor del pivote (centro por defecto)', () => {
    const b = bounds(engine().evaluate(scene([{ id: 'a', type: 'transform', params: { scale: 0.5 } }])));
    expect(b.x).toBeCloseTo(35);
    expect(b.width).toBeCloseTo(30);
  });

  it('spherize no mueve lo que queda fuera del radio', () => {
    const geo = engine().evaluate(scene([{ id: 'a', type: 'spherize', params: { radius: 0.1, strength: 1 } }]));
    expect(bounds(geo)).toEqual({ x: 20, y: 20, width: 60, height: 60 });
  });

  it('spherize con fuerza positiva empuja hacia fuera lo que está dentro', () => {
    const steps = engine().evaluateSteps(scene([{ id: 'a', type: 'spherize', params: { radius: 0.6, strength: 1 } }]));
    // El punto medio del lado superior (50, 20) está a 30 del centro, dentro del radio (36).
    const all = steps[1]!.shapes[0]!.subpaths[0]!.segs.map((s) => s.p);
    const top = all.find((p) => Math.abs(p[0] - 50) < 0.5)!;
    expect(top[1]).toBeLessThan(20);
  });

  it('twist con ángulo 0 y wave con amplitud 0 no cambian nada', () => {
    const e = engine();
    const base = bounds(e.evaluate(scene([])));
    expect(bounds(e.evaluate(scene([{ id: 'a', type: 'twist', params: { angle: 0 } }])))).toEqual(base);
    expect(bounds(e.evaluate(scene([{ id: 'a', type: 'wave', params: { amplitude: 0 } }])))).toEqual(base);
  });

  it('bend con ángulo positivo hace un arco ∩: las esquinas de arriba bajan respecto al centro del lado', () => {
    const geo = engine().evaluate(scene([{ id: 'a', type: 'bend', params: { angle: 60 } }]));
    const pts = geo.shapes[0]!.subpaths[0]!.segs.map((s) => s.p);
    const top = pts.filter((p) => p[1] < 40);
    const mid = top.reduce((a, p) => (Math.abs(p[0] - 50) < Math.abs(a[0] - 50) ? p : a));
    const corner = top.reduce((a, p) => (p[0] < a[0] ? p : a));
    expect(corner[1]).toBeGreaterThan(mid[1] + 5); // en SVG, y crece hacia abajo
  });

  it('noise es determinista: misma semilla, mismo resultado; otra semilla, otro', () => {
    const run = (seed: number) => engine().toSVG(scene([{ id: 'a', type: 'noise', params: { seed } }]));
    expect(run(3)).toBe(run(3));
    expect(run(3)).not.toBe(run(4));
  });

  it('un modificador desactivado no hace nada', () => {
    const geo = engine().evaluate(scene([{ id: 'a', type: 'transform', enabled: false, params: { x: 50 } }]));
    expect(bounds(geo).x).toBe(20);
  });

  it('un tipo desconocido avisa', () => {
    expect(() => engine().evaluate(scene([{ id: 'a', type: 'nope' }]))).toThrow(/nope/);
  });

  it('todos tienen valores por defecto válidos', () => {
    for (const m of [transform, spherize, twist, bend, wave, noise]) {
      expect(() => engine().evaluate(scene([{ id: 'a', type: m.type, params: resolveParams(m.params) }]))).not.toThrow();
    }
  });
});

describe('motor', () => {
  it('reutiliza los pasos que no han cambiado', () => {
    const e = engine();
    const stack: Scene['stack'] = [
      { id: 'a', type: 'spherize' },
      { id: 'b', type: 'wave', params: { phase: 0 } },
    ];
    const first = e.evaluateSteps(scene(stack));
    const second = e.evaluateSteps(scene([stack[0]!, { id: 'b', type: 'wave', params: { phase: 90 } }]));
    expect(second[1]).toBe(first[1]); // spherize, de la caché
    expect(second[2]).not.toBe(first[2]);
  });

  it('la cadena completa da siempre el mismo SVG', () => {
    const svg = engine().toSVG(
      scene([
        { id: 'a', type: 'transform', params: { rotation: 10 } },
        { id: 'b', type: 'spherize' },
        { id: 'c', type: 'twist' },
        { id: 'd', type: 'wave' },
        { id: 'e', type: 'noise' },
      ]),
      { precision: 1 },
    );
    expect(svg).toMatchSnapshot();
  });
});

describe('crack', () => {
  const run = (params: Record<string, unknown>) =>
    createEngine(builtins).evaluate({ version: 1, source: square, stack: [{ id: 'c', type: 'crack', params }] });

  it('añade una forma de solo trazo encima y no toca la original', () => {
    const geo = run({});
    expect(geo.shapes).toHaveLength(2);
    expect(geo.shapes[1]!.style).toMatchObject({ fill: 'none', stroke: '#000000' });
    expect(bounds({ ...geo, shapes: [geo.shapes[0]!] })).toEqual({ x: 20, y: 20, width: 60, height: 60 });
  });

  it('las grietas no salen de la forma', () => {
    const b = bounds({ ...run({ length: 2, cracks: 12 }), shapes: [run({ length: 2, cracks: 12 }).shapes[1]!] });
    expect(b.x).toBeGreaterThanOrEqual(20 - 1e-6);
    expect(b.y).toBeGreaterThanOrEqual(20 - 1e-6);
    expect(b.x + b.width).toBeLessThanOrEqual(80 + 1e-6);
    expect(b.y + b.height).toBeLessThanOrEqual(80 + 1e-6);
  });

  it('growth 0 no dibuja nada; crecer no cambia el dibujo, solo cuánto se ve', () => {
    expect(run({ growth: 0 }).shapes).toHaveLength(1);
    const half = run({ growth: 0.5 }).shapes[1]!;
    const full = run({ growth: 1 }).shapes[1]!;
    expect(half.subpaths.length).toBeLessThanOrEqual(full.subpaths.length);
    expect(half.subpaths[0]!.start).toEqual(full.subpaths[0]!.start);
    expect(half.subpaths[0]!.segs[0]!.p).toEqual(full.subpaths[0]!.segs[0]!.p);
  });

  it('impacto fuera de la forma: sin grietas', () => {
    expect(run({ impact: [-1, -1] }).shapes).toHaveLength(1);
  });

  it('es determinista con la semilla', () => {
    const svg = (seed: number) => createEngine(builtins).toSVG({ version: 1, source: square, stack: [{ id: 'c', type: 'crack', params: { seed } }] });
    expect(svg(2)).toBe(svg(2));
    expect(svg(2)).not.toBe(svg(3));
  });
});

describe('rotate3d', () => {
  const run = (params: Record<string, unknown>) =>
    createEngine(builtins).evaluate({ version: 1, source: square, stack: [{ id: 'r', type: 'rotate3d', params }] });

  it('sin giro no cambia nada', () => {
    expect(bounds(run({ rotateX: 0 }))).toEqual({ x: 20, y: 20, width: 60, height: 60 });
  });
  it('solo Z equivale a girar en plano (90° deja el cuadrado igual de grande)', () => {
    const b = bounds(run({ rotateX: 0, rotateZ: 90 }));
    expect(b.width).toBeCloseTo(60);
    expect(b.height).toBeCloseTo(60);
  });
  it('inclinar en X con perspectiva: el borde que se acerca crece y el que se aleja encoge', () => {
    const pts = run({ rotateX: 40 }).shapes[0]!.subpaths[0]!.segs.map((s) => s.p);
    const top = pts.filter((p) => p[1] < 50);
    const bottom = pts.filter((p) => p[1] > 50);
    const span = (ps: typeof pts) => Math.max(...ps.map((p) => p[0])) - Math.min(...ps.map((p) => p[0]));
    expect(span(top)).not.toBeCloseTo(span(bottom), 0);
  });
});

describe('clone', () => {
  const run = (params: Record<string, unknown>) =>
    createEngine(builtins).evaluate({ version: 1, source: square, stack: [{ id: 'c', type: 'clone', params }] });

  it('grid: filas × columnas copias, centradas en el original', () => {
    const geo = run({ mode: 'grid', columns: 3, rows: 2 });
    expect(geo.shapes).toHaveLength(6);
    const b = bounds(geo);
    expect(b.x + b.width / 2).toBeCloseTo(50);
    expect(b.y + b.height / 2).toBeCloseTo(50);
  });
  it('radial: count copias a la distancia pedida', () => {
    const geo = run({ mode: 'radial', count: 4, radius: 1, align: false });
    expect(geo.shapes).toHaveLength(4);
    expect(bounds(geo).width).toBeCloseTo(60 + 2 * 60);
  });
  it('el viewBox crece para que quepan las copias', () => {
    const geo = run({ mode: 'linear', count: 5 });
    expect(geo.viewBox[2]).toBeGreaterThan(100);
  });
});

describe('step', () => {
  const run = (stack: Scene['stack']) => createEngine(builtins).evaluate({ version: 1, source: square, stack });
  const centerOf = (geo: ReturnType<typeof run>, i: number) => {
    const b = bounds({ ...geo, shapes: [geo.shapes[i]!] });
    return [b.x + b.width / 2, b.y + b.height / 2] as const;
  };

  it('Clone marca cada copia con su número y los deformadores lo conservan', () => {
    const geo = run([
      { id: 'c', type: 'clone', params: { mode: 'grid', columns: 2, rows: 2 } },
      { id: 'w', type: 'wave' },
    ]);
    expect(geo.shapes.map((s) => s.clone)).toEqual([0, 1, 2, 3]);
  });

  it('gira cada copia un paso más que la anterior, sobre su propio centro', () => {
    const base = run([{ id: 'c', type: 'clone', params: { mode: 'linear', count: 3 } }]);
    const geo = run([
      { id: 'c', type: 'clone', params: { mode: 'linear', count: 3 } },
      { id: 's', type: 'step', params: { rotation: 45 } },
    ]);
    // El centro no se mueve (gira sobre sí misma)…
    for (const i of [0, 1, 2]) expect(centerOf(geo, i)[0]).toBeCloseTo(centerOf(base, i)[0]);
    // …y el ancho crece con el giro: 45° (1.ª) y 135° (3.ª) dan el mismo ancho, 90° (2.ª) el original.
    const width = (i: number) => bounds({ ...geo, shapes: [geo.shapes[i]!] }).width;
    expect(width(0)).toBeCloseTo(width(2));
    expect(width(1)).toBeCloseTo(60);
  });

  it('sin Clone, cada forma es un elemento', () => {
    const two = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="10"/><rect x="50" y="0" width="10" height="10"/></svg>';
    const geo = createEngine(builtins).evaluate({ version: 1, source: two, stack: [{ id: 's', type: 'step', params: { rotation: 0, offset: [0, 0.1] } }] });
    const ys = geo.shapes.map((s) => bounds({ ...geo, shapes: [s] }).y);
    expect(ys[1]! - ys[0]!).toBeCloseTo(1); // paso de 0.1 × 10 de alto: la 1.ª baja 1 y la 2.ª, 2
  });
});
