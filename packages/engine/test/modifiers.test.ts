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
  const run = (stack: Scene['stack'], source = square) => createEngine(builtins).evaluate({ version: 1, source, stack });
  const boxOf = (geo: ReturnType<typeof run>, i: number) => bounds({ ...geo, shapes: [geo.shapes[i]!] });

  it('Clone marca cada copia con su número y los deformadores lo conservan', () => {
    const geo = run([
      { id: 'c', type: 'clone', params: { mode: 'grid', columns: 2, rows: 2 } },
      { id: 'w', type: 'wave' },
    ]);
    expect(geo.shapes.map((s) => s.clone)).toEqual([0, 1, 2, 3]);
  });

  it('sin hijos no hace nada', () => {
    const base = run([{ id: 'c', type: 'clone', params: { mode: 'linear', count: 3 } }]);
    const geo = run([{ id: 'c', type: 'clone', params: { mode: 'linear', count: 3 } }, { id: 's', type: 'step' }]);
    expect(geo.shapes.map((_, i) => boxOf(geo, i))).toEqual(base.shapes.map((_, i) => boxOf(base, i)));
  });

  it('aplica cualquier modificador hijo con sus números multiplicados por la posición', () => {
    const geo = run([
      { id: 'c', type: 'clone', params: { mode: 'linear', count: 3 } },
      { id: 's', type: 'step', children: [{ id: 't', type: 'transform', params: { rotation: 45 } }] },
    ]);
    // 45° (1.ª) y 135° (3.ª) dan el mismo ancho; 90° (2.ª), el del cuadrado: cada copia gira sobre su centro.
    expect(boxOf(geo, 0).width).toBeCloseTo(boxOf(geo, 2).width);
    expect(boxOf(geo, 1).width).toBeCloseTo(60);
  });

  it('la escala crece desde 1, no desde 0', () => {
    const geo = run([
      { id: 'c', type: 'clone', params: { mode: 'linear', count: 2 } },
      { id: 's', type: 'step', children: [{ id: 't', type: 'transform', params: { scale: 1.5 } }] },
    ]);
    expect(boxOf(geo, 0).width).toBeCloseTo(90); // 1 + 0.5 × 1
    expect(boxOf(geo, 1).width).toBeCloseTo(120); // 1 + 0.5 × 2
  });

  it('dentro de cada copia, el centro 0.5 es el de la copia', () => {
    const geo = run([
      { id: 'c', type: 'clone', params: { mode: 'linear', count: 2 } },
      { id: 's', type: 'step', children: [{ id: 'sp', type: 'spherize', params: { strength: 0.5, radius: 0.4 } }] },
    ]);
    // Las dos copias se deforman (con un centro global, la segunda quedaría fuera del radio).
    expect(geo.shapes[0]!.subpaths[0]!.segs.length).toBeGreaterThan(4);
    expect(geo.shapes[1]!.subpaths[0]!.segs.length).toBeGreaterThan(4);
  });

  it('sin Clone, cada forma es un elemento; un hijo apagado no cuenta', () => {
    const two = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="10"/><rect x="50" y="0" width="10" height="10"/></svg>';
    const on = run([{ id: 's', type: 'step', children: [{ id: 't', type: 'transform', params: { y: 5 } }] }], two);
    expect(boxOf(on, 1).y - boxOf(on, 0).y).toBeCloseTo(5);
    const off = run([{ id: 's', type: 'step', children: [{ id: 't', type: 'transform', enabled: false, params: { y: 5 } }] }], two);
    expect(boxOf(off, 0).y).toBe(0);
  });
});

describe('distorsiones', () => {
  const run = (type: string, params: Record<string, unknown> = {}) =>
    createEngine(builtins).evaluate({ version: 1, source: square, stack: [{ id: 'x', type, params }] });

  it('todas funcionan con sus valores por defecto y sin efecto devuelven lo mismo', () => {
    const neutral: Record<string, Record<string, unknown>> = {
      taper: { amount: 0 },
      shear: { x: 0, y: 0 },
      ripple: { amplitude: 0 },
      melt: { amount: 0 },
      perspective: { topLeft: [0, 0], topRight: [1, 0] },
      envelope: {},
      cylinder: { wrap: 0.0001, perspective: 0 },
    };
    for (const [type, params] of Object.entries(neutral)) {
      expect(() => run(type)).not.toThrow();
      if (type === 'cylinder') continue; // con wrap mínimo es casi plano, no idéntico
      const b = bounds(run(type, params));
      expect(b.x).toBeCloseTo(20);
      expect(b.width).toBeCloseTo(60);
    }
  });

  it('taper estrecha el final; shear inclina', () => {
    const t = run('taper', { amount: 0.5 }).shapes[0]!.subpaths[0]!.segs.map((s) => s.p);
    const bottom = t.filter((p) => p[1] > 79.999);
    expect(Math.max(...bottom.map((p) => p[0])) - Math.min(...bottom.map((p) => p[0]))).toBeCloseTo(30);
    expect(bounds(run('shear', { x: 45, y: 0 })).width).toBeCloseTo(120);
  });

  it('perspective lleva cada esquina a su sitio', () => {
    const geo = run('perspective', { topLeft: [0.25, 0], topRight: [0.75, 0], bottomRight: [1, 1], bottomLeft: [0, 1] });
    const pts = geo.shapes[0]!.subpaths[0]!.segs.map((s) => s.p);
    const top = pts.filter((p) => Math.abs(p[1] - 20) < 1e-6);
    expect(Math.min(...top.map((p) => p[0]))).toBeCloseTo(35);
    expect(Math.max(...top.map((p) => p[0]))).toBeCloseTo(65);
  });

  it('melt solo baja, y más abajo más', () => {
    const b = bounds(run('melt', { amount: 0.5 }));
    expect(b.y).toBeCloseTo(20);
    expect(b.y + b.height).toBeGreaterThan(80);
  });
});

describe('dado', () => {
  it('sortea dentro de los rangos y es reproducible con el mismo azar', async () => {
    const { randomizeParams, rng, spherize, clone, crack } = await import('../src');
    const a = randomizeParams(spherize.params, resolveParams(spherize.params), rng(5));
    const b = randomizeParams(spherize.params, resolveParams(spherize.params), rng(5));
    expect(a).toEqual(b);
    expect(a.strength as number).toBeGreaterThanOrEqual(-1);
    expect(a.strength as number).toBeLessThanOrEqual(1);
    const [cx, cy] = a.center as [number, number];
    expect(cx).toBeGreaterThanOrEqual(0.2);
    expect(cy).toBeLessThanOrEqual(0.8);
    // El modo de Clone y el color de Crack no se sortean.
    expect(randomizeParams(clone.params, resolveParams(clone.params), rng(1)).mode).toBe('grid');
    expect(randomizeParams(crack.params, resolveParams(crack.params), rng(1)).color).toBe('#000000');
  });
});

describe('color', () => {
  const two = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="10" height="10" fill="#ff0000"/><rect x="50" width="10" height="10" fill="#ff0000" stroke="#0000ff"/><rect y="50" width="10" height="10" fill="none"/></svg>';
  const run = (params: Record<string, unknown>, stack: Scene['stack'] = []) =>
    createEngine(builtins).evaluate({ version: 1, source: two, stack: [...stack, { id: 'c', type: 'color', params }] });

  it('shift: girar 120° el tono del rojo da verde; none no se toca', () => {
    const geo = run({ mode: 'shift', hue: 120 });
    expect(geo.shapes[0]!.style.fill).toBe('#00ff00');
    expect(geo.shapes[2]!.style.fill).toBe('none');
    expect(geo.shapes[1]!.style.stroke).toBe('#0000ff'); // target fill: el trazo, igual
  });

  it('gradient reparte de un color a otro entre los elementos', () => {
    const geo = run({ mode: 'gradient', from: '#000000', to: '#ffffff' });
    expect(geo.shapes[0]!.style.fill).toBe('#000000');
    expect(geo.shapes[1]!.style.fill).toBe('#808080');
  });

  it('random es determinista y cambia con la semilla', () => {
    const a = run({ mode: 'random', seed: 3 }).shapes.map((s) => s.style.fill);
    expect(run({ mode: 'random', seed: 3 }).shapes.map((s) => s.style.fill)).toEqual(a);
    expect(run({ mode: 'random', seed: 4 }).shapes.map((s) => s.style.fill)).not.toEqual(a);
  });

  it('dentro de Step, el tono se escalona copia a copia', () => {
    const geo = createEngine(builtins).evaluate({
      version: 1,
      source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#ff0000"/></svg>',
      stack: [
        { id: 'cl', type: 'clone', params: { mode: 'linear', count: 3 } },
        { id: 's', type: 'step', children: [{ id: 'c', type: 'color', params: { hue: 120 } }] },
      ],
    });
    expect(geo.shapes.map((s) => s.style.fill)).toEqual(['#00ff00', '#0000ff', '#ff0000']);
  });

  it('parseColor entiende hex corto, rgb() y nombres', async () => {
    const { parseColor } = await import('../src');
    expect(parseColor('#f00')).toEqual([255, 0, 0, 1]);
    expect(parseColor('rgb(0, 128, 255)')).toEqual([0, 128, 255, 1]);
    expect(parseColor('white')).toEqual([255, 255, 255, 1]);
    expect(parseColor('url(#g)')).toBeNull();
  });
});

describe('paint', () => {
  const src = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="10" height="10" fill="#ff0000"/><line x1="0" y1="50" x2="100" y2="50" stroke="#000" fill="none"/></svg>';
  const run = (params: Record<string, unknown>) =>
    createEngine(builtins).evaluate({ version: 1, source: src, stack: [{ id: 'p', type: 'paint', params }] });

  it('cantidad 1 sustituye el relleno; 0.5 mezcla; las líneas sin relleno no se rellenan', () => {
    expect(run({ fillColor: '#0000ff' }).shapes[0]!.style.fill).toBe('#0000ff');
    expect(run({ fillColor: '#0000ff', fillAmount: 0.5 }).shapes[0]!.style.fill).toBe('#800080');
    expect(run({ fillColor: '#0000ff' }).shapes[1]!.style.fill).toBe('none');
    expect(run({ fillColor: '#0000ff', fillEmpty: true }).shapes[1]!.style.fill).toBe('#0000ff');
  });

  it('el trazo se añade con su color, grosor y opacidad', () => {
    const s = run({ fill: false, stroke: true, strokeColor: '#00ff00', strokeWidth: 3, strokeOpacity: 0.5 }).shapes[0]!.style;
    expect(s).toMatchObject({ fill: '#ff0000', stroke: '#00ff00', 'stroke-width': '3', 'stroke-opacity': '0.5' });
  });
});

describe('tint', () => {
  it('lleva el color hacia el objetivo; en Step, cada copia un poco más', () => {
    const geo = createEngine(builtins).evaluate({
      version: 1,
      source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#000000"/></svg>',
      stack: [
        { id: 'cl', type: 'clone', params: { mode: 'linear', count: 3 } },
        { id: 's', type: 'step', children: [{ id: 't', type: 'tint', params: { color: '#ffffff', amount: 0.25 } }] },
      ],
    });
    expect(geo.shapes.map((s) => s.style.fill)).toEqual(['#404040', '#808080', '#bfbfbf']);
  });
});

describe('mirror', () => {
  const run = (params: Record<string, unknown>) => createEngine(builtins).evaluate({ version: 1, source: square, stack: [{ id: 'm', type: 'mirror', params }] });

  it('simetría: el original y su reflejo al otro lado del borde derecho', () => {
    const geo = run({});
    expect(geo.shapes).toHaveLength(2);
    expect(bounds(geo)).toEqual({ x: 20, y: 20, width: 120, height: 60 });
    expect(geo.shapes.map((s) => s.clone)).toEqual([0, 1]);
  });

  it('sin el original y en vertical, con el eje en el centro: queda en su sitio', () => {
    const geo = run({ axis: 'vertical', position: 0.5, original: 'transform' });
    expect(geo.shapes).toHaveLength(1);
    expect(bounds(geo)).toEqual({ x: 20, y: 20, width: 60, height: 60 });
  });
});
