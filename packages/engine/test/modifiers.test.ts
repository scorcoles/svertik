import { describe, expect, it } from 'vitest';
import { covers, simplify } from '../src/clip';
import { bend, bounds, builtins, createEngine, noise, randomizeParams, resolveParams, rng, spherize, transform, twist, wave, zeroParams, toSVG, type StackInput } from '../src';

const square = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="20" y="20" width="60" height="60"/></svg>';
const scene = (stack: StackInput['stack']): StackInput => ({ source: square, stack });
const engine = () => createEngine(builtins);

describe('modificadores', () => {
  it('transform desplaza', () => {
    const geo = engine().evaluateStack(scene([{ id: 'a', type: 'transform', params: { x: 5, y: -5 } }]));
    expect(bounds(geo)).toEqual({ x: 25, y: 15, width: 60, height: 60 });
  });

  it('transform escala alrededor del pivote (centro por defecto)', () => {
    const b = bounds(engine().evaluateStack(scene([{ id: 'a', type: 'transform', params: { scale: 0.5 } }])));
    expect(b.x).toBeCloseTo(35);
    expect(b.width).toBeCloseTo(30);
  });

  it('spherize no mueve lo que queda fuera del radio', () => {
    const geo = engine().evaluateStack(scene([{ id: 'a', type: 'spherize', params: { radius: 0.1, strength: 1 } }]));
    expect(bounds(geo)).toEqual({ x: 20, y: 20, width: 60, height: 60 });
  });

  it('spherize con fuerza positiva empuja hacia fuera lo que está dentro', () => {
    const steps = engine().evaluateStackSteps(scene([{ id: 'a', type: 'spherize', params: { radius: 0.6, strength: 1 } }]));
    // El punto medio del lado superior (50, 20) está a 30 del centro, dentro del radio (36).
    const all = steps[1]!.shapes[0]!.subpaths[0]!.segs.map((s) => s.p);
    const top = all.find((p) => Math.abs(p[0] - 50) < 0.5)!;
    expect(top[1]).toBeLessThan(20);
  });

  it('twist con ángulo 0 y wave con amplitud 0 no cambian nada', () => {
    const e = engine();
    const base = bounds(e.evaluateStack(scene([])));
    expect(bounds(e.evaluateStack(scene([{ id: 'a', type: 'twist', params: { angle: 0 } }])))).toEqual(base);
    expect(bounds(e.evaluateStack(scene([{ id: 'a', type: 'wave', params: { amplitude: 0 } }])))).toEqual(base);
  });

  it('bend con ángulo positivo hace un arco ∩: las esquinas de arriba bajan respecto al centro del lado', () => {
    const geo = engine().evaluateStack(scene([{ id: 'a', type: 'bend', params: { angle: 60 } }]));
    const pts = geo.shapes[0]!.subpaths[0]!.segs.map((s) => s.p);
    const top = pts.filter((p) => p[1] < 40);
    const mid = top.reduce((a, p) => (Math.abs(p[0] - 50) < Math.abs(a[0] - 50) ? p : a));
    const corner = top.reduce((a, p) => (p[0] < a[0] ? p : a));
    expect(corner[1]).toBeGreaterThan(mid[1] + 5); // en SVG, y crece hacia abajo
  });

  it('noise es determinista: misma semilla, mismo resultado; otra semilla, otro', () => {
    const run = (seed: number) => toSVG(engine().evaluateStack(scene([{ id: 'a', type: 'noise', params: { seed } }])));
    expect(run(3)).toBe(run(3));
    expect(run(3)).not.toBe(run(4));
  });

  it('un modificador desactivado no hace nada', () => {
    const geo = engine().evaluateStack(scene([{ id: 'a', type: 'transform', enabled: false, params: { x: 50 } }]));
    expect(bounds(geo).x).toBe(20);
  });

  it('un tipo desconocido avisa', () => {
    expect(() => engine().evaluateStack(scene([{ id: 'a', type: 'nope' }]))).toThrow(/nope/);
  });

  it('todos tienen valores por defecto válidos', () => {
    for (const m of [transform, spherize, twist, bend, wave, noise]) {
      expect(() => engine().evaluateStack(scene([{ id: 'a', type: m.type, params: resolveParams(m.params) }]))).not.toThrow();
    }
  });
});

describe('motor', () => {
  it('reutiliza los pasos que no han cambiado', () => {
    const e = engine();
    const stack: StackInput['stack'] = [
      { id: 'a', type: 'spherize' },
      { id: 'b', type: 'wave', params: { phase: 0 } },
    ];
    const first = e.evaluateStackSteps(scene(stack));
    const second = e.evaluateStackSteps(scene([stack[0]!, { id: 'b', type: 'wave', params: { phase: 90 } }]));
    expect(second[1]).toBe(first[1]); // spherize, de la caché
    expect(second[2]).not.toBe(first[2]);
  });

  it('la cadena completa da siempre el mismo SVG', () => {
    const svg = toSVG(
      engine().evaluateStack(
        scene([
          { id: 'a', type: 'transform', params: { rotation: 10 } },
          { id: 'b', type: 'spherize' },
          { id: 'c', type: 'twist' },
          { id: 'd', type: 'wave' },
          { id: 'e', type: 'noise' },
        ]),
      ),
      { precision: 1 },
    );
    expect(svg).toMatchSnapshot();
  });
});

describe('crack', () => {
  const run = (params: Record<string, unknown>) =>
    createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'c', type: 'crack', params: { mode: 'lines', ...params } }] });

  it('cut: recorta las grietas como huecos (sin forma de trazo encima); shatter: separa los trozos', () => {
    const cut = run({ mode: 'cut', width: 2 });
    expect(cut.shapes.every((s) => s.style.stroke !== '#000000')).toBe(true);
    // Hay huecos: más subtrazados (o trozos) que el cuadrado entero.
    expect(cut.shapes.flatMap((s) => s.subpaths).length).toBeGreaterThan(1);
    const shatter = run({ mode: 'shatter', width: 2, separation: 10 });
    expect(shatter.shapes.map((s) => s.clone)).toEqual(shatter.shapes.map((_, i) => i));
    const b = bounds(shatter);
    expect(b.width).toBeGreaterThan(60);
  });

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
    const svg = (seed: number) => toSVG(createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'c', type: 'crack', params: { seed } }] }));
    expect(svg(2)).toBe(svg(2));
    expect(svg(2)).not.toBe(svg(3));
  });
});

describe('rotate3d', () => {
  const run = (params: Record<string, unknown>) =>
    createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'r', type: 'rotate3d', params }] });

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
    createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'c', type: 'clone', params }] });

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
  const run = (stack: StackInput['stack'], source = square) => createEngine(builtins).evaluateStack({ source, stack });
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
    createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'x', type, params }] });

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
  const run = (params: Record<string, unknown>, stack: StackInput['stack'] = []) =>
    createEngine(builtins).evaluateStack({ source: two, stack: [...stack, { id: 'c', type: 'color', params }] });

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
    const geo = createEngine(builtins).evaluateStack({
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
    createEngine(builtins).evaluateStack({ source: src, stack: [{ id: 'p', type: 'paint', params }] });

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
    const geo = createEngine(builtins).evaluateStack({
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
  const run = (params: Record<string, unknown>) => createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'm', type: 'mirror', params }] });

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

describe('clone lineal con huecos iguales', () => {
  it('con escala, los huecos entre copias son todos iguales', () => {
    const geo = createEngine(builtins).evaluateStack({
      source: square,
      stack: [{ id: 'c', type: 'clone', params: { mode: 'linear', count: 4, offset: [1.5, 0], scaleStep: 0.5, even: true } }],
    });
    const boxes = geo.shapes.map((s) => bounds({ viewBox: [0, 0, 0, 0], shapes: [s] })).sort((a, b) => a.x - b.x);
    const gaps = boxes.slice(1).map((b, i) => b.x - (boxes[i]!.x + boxes[i]!.width));
    // El cuadrado mide 60 y el desplazamiento 90: hueco de 30 entre todas.
    for (const g of gaps) expect(g).toBeCloseTo(30);
  });
});

describe('gradient', () => {
  it('pone url(#…) en el relleno y escribe el degradado en <defs>', () => {
    const e = createEngine(builtins);
    const scene: StackInput = { source: square, stack: [{ id: 'g', type: 'gradient', params: { angle: 0 } }] };
    const geo = e.evaluateStack(scene);
    expect(geo.shapes[0]!.style.fill).toMatch(/^url\(#svk-/);
    const svg = toSVG(e.evaluateStack(scene));
    expect(svg).toContain('<defs><linearGradient');
    expect(svg).toContain('x1="0" y1="0.5" x2="1" y2="0.5"');
  });
});

describe('mosaic', () => {
  const run = (params: Record<string, unknown>) =>
    createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'm', type: 'mosaic', params }] });
  const area = (geo: { shapes: { subpaths: { start: readonly [number, number]; segs: { p: readonly [number, number] }[] }[] }[] }) =>
    geo.shapes.flatMap((s) => s.subpaths).reduce((sum, sp) => {
      const pts = [sp.start, ...sp.segs.map((g) => g.p)];
      let a = 0;
      for (let i = 0; i < pts.length - 1; i++) a += pts[i]![0] * pts[i + 1]![1] - pts[i + 1]![0] * pts[i]![1];
      return sum + Math.abs(a) / 2;
    }, 0);

  it('sin separación, 2 × 2 teselas que cubren el dibujo; cada una, un elemento', () => {
    const geo = run({ columns: 2, rows: 2, gutter: [0, 0] });
    expect(geo.shapes.map((s) => s.clone)).toEqual([0, 1, 2, 3]);
    expect(area(geo)).toBeCloseTo(3600);
  });

  it('la separación, en px: el hueco entre teselas', () => {
    // 2 × 2 teselas de 30 con 10 px de hueco: cada una, 20 × 20.
    expect(area(run({ columns: 2, rows: 2, gutter: [10, 10] }))).toBeCloseTo(4 * 400);
    // Solo en X: 3 × 3 teselas de 20 con 10 px → 10 × 20 cada una.
    expect(area(run({ columns: 3, rows: 3, gutter: [10, 0] }))).toBeCloseTo(9 * 200);
    // Más hueco que tesela: no queda nada.
    expect(run({ columns: 2, rows: 2, gutter: [40, 40] }).shapes).toHaveLength(0);
  });

  it('triángulos y hexágonos cubren todo; los círculos, π/4', () => {
    expect(area(run({ tile: 'triangle', columns: 3, rows: 3, gutter: [0, 0] }))).toBeCloseTo(3600, 0);
    expect(area(run({ tile: 'hexagon', columns: 3, rows: 3, gutter: [0, 0] }))).toBeCloseTo(3600, 0);
    expect(area(run({ tile: 'circle', columns: 2, rows: 2, gutter: [0, 0] }) ) / 3600).toBeCloseTo(Math.PI / 4, 2);
  });

  it('polígonos y estrellas, una por celda', () => {
    const hex = run({ tile: 'polygon', sides: 6, columns: 2, rows: 2, gutter: [0, 0] });
    expect(hex.shapes.map((s) => s.clone)).toEqual([0, 1, 2, 3]);
    // Hexágono inscrito en una celda de 30 (radio 15): 3√3/2 · r².
    expect(area(hex) / 4).toBeCloseTo((3 * Math.sqrt(3) / 2) * 15 * 15, 0);
    expect(area(run({ tile: 'star', sides: 5, columns: 2, rows: 2, gutter: [0, 0] }))).toBeLessThan(area(run({ tile: 'polygon', sides: 5, columns: 2, rows: 2, gutter: [0, 0] })));
  });

  it('whole: teselas enteras donde el dibujo cubre al menos la mitad', () => {
    // 4 × 4 celdas de 25 sobre el lienzo de 100, pero el dibujo es el cuadrado de 60: la red se ajusta
    // a él, así que todas caen dentro y salen enteras (círculos completos, no recortados).
    const geo = run({ tile: 'circle', fit: 'whole', columns: 3, rows: 3, gutter: [0, 0] });
    expect(geo.shapes).toHaveLength(9);
    expect(area(geo) / 3600).toBeCloseTo(Math.PI / 4, 2);
  });
});

describe('mosaic con la forma de otro objeto', () => {
  it('cada celda lleva la forma del objeto, encajada sin deformarla', () => {
    const doc = createEngine(builtins).evaluateDocument({
      version: 2,
      objects: [
        { kind: 'object', id: 'd', name: 'd', source: square, stack: [{ id: 'm', type: 'mosaic', params: { tile: 'shape', source: 'tri', columns: 2, rows: 2, gutter: [0, 0], fit: 'whole' } }] },
        { kind: 'shape', id: 'tri', name: 'tri', shape: 'polygon', params: { sides: 3 }, stack: [], transform: { x: 500 } },
      ],
    });
    const tiles = doc.geometry.shapes.filter((s) => s.node === 'd');
    expect(tiles).toHaveLength(4);
    // Cada tesela, un triángulo (3 vértices).
    expect(tiles.every((s) => s.subpaths[0]!.segs.length === 3)).toBe(true);
  });

  it('sin objeto, el dibujo como estaba', () => {
    const geo = createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'm', type: 'mosaic', params: { tile: 'shape' } }] });
    expect(bounds(geo)).toMatchObject({ x: 20, width: 60 });
  });
});

describe('mosaic girado', () => {
  it('con la red a 45° sigue cubriendo todo el dibujo', () => {
    const geo = createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'm', type: 'mosaic', params: { columns: 4, rows: 4, gutter: [0, 0], angle: 45 } }] });
    const b = bounds(geo);
    expect(b.x).toBeCloseTo(20);
    expect(b.width).toBeCloseTo(60);
    // Las piezas de las esquinas son triángulos (la red va en diagonal).
    expect(geo.shapes.some((s) => s.subpaths[0]!.segs.length === 3)).toBe(true);
  });
});

describe('damage', () => {
  const run = (params: Record<string, unknown>) =>
    createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'd', type: 'damage', params }] });
  const holes = (geo: ReturnType<typeof run>) => geo.shapes.flatMap((s) => s.subpaths).length;

  it('recorta grietas, desconchones y motas; misma semilla, mismo resultado', () => {
    const a = run({ seed: 7 });
    expect(holes(a)).toBeGreaterThan(5);
    expect(JSON.stringify(run({ seed: 7 }))).toBe(JSON.stringify(a));
    expect(JSON.stringify(run({ seed: 8 }))).not.toBe(JSON.stringify(a));
    // No se sale de la forma.
    const b = bounds(a);
    expect(b.x).toBeGreaterThanOrEqual(19.99);
    expect(b.x + b.width).toBeLessThanOrEqual(80.01);
  });

  it('sin nada que recortar, deja la forma como estaba', () => {
    const geo = run({ cracks: 0, chips: 0, specks: 0 });
    expect(bounds(geo)).toEqual({ x: 20, y: 20, width: 60, height: 60 });
  });
});

describe('roughen y fractal', () => {
  const run = (stack: StackInput['stack']) => createEngine(builtins).evaluateStack({ source: square, stack });
  const points = (geo: ReturnType<typeof run>) => geo.shapes.flatMap((s) => s.subpaths).reduce((n, sp) => n + sp.segs.length, 0);

  it('koch: cada iteración multiplica los tramos por 4 (cuadrado: 4 → 16 → 64)', () => {
    expect(points(run([{ id: 'r', type: 'roughen', params: { mode: 'koch', iterations: 1 } }]))).toBe(16);
    expect(points(run([{ id: 'r', type: 'roughen', params: { mode: 'koch', iterations: 2 } }]))).toBe(64);
  });

  it('organic: rasga sin salirse mucho y siempre igual con la misma semilla', () => {
    const a = run([{ id: 'r', type: 'roughen', params: { amount: 0.5, detail: 0.05 } }]);
    expect(points(a)).toBeGreaterThan(20);
    expect(JSON.stringify(run([{ id: 'r', type: 'roughen', params: { amount: 0.5, detail: 0.05 } }]))).toBe(JSON.stringify(a));
  });

  it('fractal: sierpinski 3ⁿ copias; carpet con tope; tree guarda todos los niveles', () => {
    expect(run([{ id: 'f', type: 'fractal', params: { preset: 'sierpinski', depth: 3 } }]).shapes).toHaveLength(27);
    // 8⁵ = 32 768 > 4 096: baja a 8⁴.
    expect(run([{ id: 'f', type: 'fractal', params: { preset: 'carpet', depth: 5 } }]).shapes).toHaveLength(4096);
    expect(run([{ id: 'f', type: 'fractal', params: { preset: 'tree', depth: 3 } }]).shapes).toHaveLength(1 + 2 + 4 + 8);
    expect(run([{ id: 'f', type: 'fractal', params: { preset: 'spiral', depth: 10 } }]).shapes).toHaveLength(11);
  });
});

describe('fractal fit y glitch', () => {
  const run = (stack: StackInput['stack']) => createEngine(builtins).evaluateStack({ source: square, stack });

  it('fit: el árbol cabe en la caja del cuadrado original', () => {
    const b = bounds(run([{ id: 'f', type: 'fractal', params: { preset: 'tree', depth: 6 } }]));
    expect(b.width).toBeLessThanOrEqual(60.01);
    expect(b.height).toBeLessThanOrEqual(60.01);
    expect(b.x).toBeGreaterThanOrEqual(19.99);
    const free = bounds(run([{ id: 'f', type: 'fractal', params: { preset: 'tree', depth: 6, fit: false } }]));
    expect(free.height).toBeGreaterThan(60);
  });

  it('glitch, por piezas: cada una hace lo suyo y se combinan; misma semilla, mismo resultado', () => {
    // Slices: franjas, cada una un elemento.
    const sl = run([{ id: 's', type: 'slices', params: { count: 6, chance: 1, seed: 3 } }]);
    expect(new Set(sl.shapes.map((s) => s.clone)).size).toBe(6);
    expect(JSON.stringify(run([{ id: 's', type: 'slices', params: { count: 6, chance: 1, seed: 3 } }]))).toBe(JSON.stringify(sl));
    // Blocks: más piezas (lo de dentro de cada bloque, aparte) y la misma superficie movida.
    expect(run([{ id: 'b', type: 'blocks', params: { count: 4, size: 0.2, seed: 2 } }]).shapes.length).toBeGreaterThan(1);
    // Scanlines: el cuadrado sigue siendo uno, con huecos.
    const sc = run([{ id: 'l', type: 'scanlines', params: { count: 10 } }]);
    expect(sc.shapes).toHaveLength(1);
    expect(sc.shapes[0]!.subpaths.length).toBeGreaterThan(5);
    // Streaks: el dibujo, más las rayas del color del dibujo.
    const st = run([{ id: 'r', type: 'streaks', params: { count: 5 } }]);
    expect(st.shapes).toHaveLength(6);
    // Encadenados: las franjas pasan por los bloques.
    expect(run([{ id: 's', type: 'slices', params: { seed: 1 } }, { id: 'b', type: 'blocks', params: { seed: 1 } }]).shapes.length).toBeGreaterThan(sl.shapes.length);
  });

  it('RGB Split es un filtro: no toca la geometría', () => {
    expect(run([{ id: 'x', type: 'rgbsplit', params: { distance: 5 } }])).toEqual(run([]));
  });
});

describe('damage: trozos', () => {
  it('una grieta pasante parte el cuadrado: cada trozo es un elemento', () => {
    const geo = createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'd', type: 'damage', params: { cracks: 0, chips: 0, specks: 0, through: 1, roughness: 0 } }] });
    expect(geo.shapes.length).toBeGreaterThanOrEqual(2);
    expect(geo.shapes.map((s) => s.clone)).toEqual(geo.shapes.map((_, i) => i));
  });
});

describe('a cero y dado', () => {
  it('a cero: números y ángulos a 0, la escala a 1, los conteos a su mínimo', () => {
    const t = builtins.find((m) => m.type === 'transform')!;
    expect(zeroParams(t.params, resolveParams(t.params, { x: 5, rotation: 30, scale: 2 }))).toMatchObject({ x: 0, rotation: 0, scale: 1 });
    const c = builtins.find((m) => m.type === 'clone')!;
    expect(zeroParams(c.params, resolveParams(c.params)).count).toBe(1);
    // Los lugares del dibujo (el centro de Explosion) vuelven a su sitio, no a la esquina.
    const ex = builtins.find((d) => d.type === 'explosion')!;
    expect(zeroParams(ex.params, resolveParams(ex.params, { center: [0.1, 0.9], amount: 1 }))).toMatchObject({ center: [0.5, 0.5], amount: 0 });
    // Las distancias, a cero: la separación de Mosaic.
    const mo = builtins.find((d) => d.type === 'mosaic')!;
    expect(zeroParams(mo.params, resolveParams(mo.params)).gutter).toEqual([0, 0]);
  });
  it('el dado se queda cerca de los valores de partida (no de punta a punta)', () => {
    const c = builtins.find((m) => m.type === 'clone')!;
    for (let i = 0; i < 50; i++) {
      const v = randomizeParams(c.params, resolveParams(c.params), rng(i)).count as number;
      expect(v).toBeLessThanOrEqual(6 + 64 * 0.15 + 1);
    }
  });
});

describe('gradient radial y con paso', () => {
  it('radial con centro, radio y foco; color de paso', () => {
    const svg = toSVG(createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'g', type: 'gradient', params: { kind: 'radial', center: [0.3, 0.4], radius: 0.8, focus: [0.2, 0.2], via: true, viaColor: '#ff0000' } }] }));
    expect(svg).toContain('<radialGradient');
    expect(svg).toContain('cx="0.3" cy="0.4" r="0.8" fx="0.2" fy="0.2"');
    expect(svg).toContain('stop-color="#ff0000"');
  });
});

describe('range, field y opacity', () => {
  const grid = (stack: StackInput['stack']) =>
    createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'c', type: 'clone', params: { mode: 'linear', count: 4, offset: [1.2, 0] } }, ...stack] });
  const op = (geo: ReturnType<typeof grid>) => geo.shapes.map((s) => Number(s.style.opacity ?? 1));

  it('range: solo los elementos del tramo reciben el efecto (square)', () => {
    const geo = grid([{ id: 'r', type: 'range', params: { start: 0, end: 0.5 }, children: [{ id: 'o', type: 'opacity', params: { opacity: 0 } }] }]);
    expect(op(geo)).toEqual([0, 0, 1, 1]);
  });

  it('range con offset: el tramo se desplaza', () => {
    const geo = grid([{ id: 'r', type: 'range', params: { start: 0, end: 0.5, offset: 0.5 }, children: [{ id: 'o', type: 'opacity', params: { opacity: 0 } }] }]);
    expect(op(geo)).toEqual([1, 1, 0, 0]);
  });

  it('field: más efecto cerca del centro, nada fuera del radio', () => {
    const geo = grid([{ id: 'f', type: 'field', params: { center: [0.5, 0.5], radius: 1.5, softness: 0.5 }, children: [{ id: 'o', type: 'opacity', params: { opacity: 0 } }] }]);
    const o = op(geo);
    // La copia de la izquierda del todo está lejos: casi intacta; las del centro, casi invisibles.
    expect(Math.max(...o)).toBeGreaterThan(0.9);
    expect(Math.min(...o)).toBeLessThan(0.5);
  });
});

describe('stagger', () => {
  const run = (params: Record<string, unknown>) =>
    createEngine(builtins).evaluateStack({
      source: square,
      stack: [
        { id: 'c', type: 'clone', params: { mode: 'linear', count: 4, offset: [1.2, 0] } },
        { id: 's', type: 'stagger', params: { ease: 'linear', ...params }, children: [{ id: 'o', type: 'opacity', params: { opacity: 0 } }] },
      ],
    });
  const op = (geo: ReturnType<typeof run>) => geo.shapes.map((s) => Math.round(Number(s.style.opacity ?? 1) * 100) / 100);

  it('in: al principio todos con el efecto; al final, todos en su sitio', () => {
    expect(op(run({ progress: 0 }))).toEqual([0, 0, 0, 0]);
    expect(op(run({ progress: 1 }))).toEqual([1, 1, 1, 1]);
  });
  it('a medias y escalonado del todo: los primeros ya han llegado y los últimos no', () => {
    expect(op(run({ progress: 0.5, stagger: 1 }))).toEqual([1, 1, 0, 0]);
  });
  it('out y orden inverso', () => {
    expect(op(run({ progress: 0.5, stagger: 1, direction: 'out', order: 'reverse' }))).toEqual([1, 1, 0, 0]);
  });
});

describe('damage: growth continuo', () => {
  const run = (params: Record<string, unknown>) =>
    createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'd', type: 'damage', params: { seed: 4, ...params } }] });
  const area = (geo: ReturnType<typeof run>) =>
    geo.shapes.flatMap((s) => s.subpaths).reduce((sum, sp) => {
      const pts = [sp.start, ...sp.segs.map((g) => g.p)];
      let a = 0;
      for (let i = 0; i < pts.length - 1; i++) a += pts[i]![0] * pts[i + 1]![1] - pts[i + 1]![0] * pts[i]![1];
      return sum + a / 2;
    }, 0);

  it('al crecer, lo recortado solo aumenta (las grietas avanzan por su camino)', () => {
    const areas = [0.25, 0.5, 0.75, 1].map((g) => Math.abs(area(run({ growth: g, chips: 0, specks: 0, roughness: 0.5 }))));
    for (let i = 1; i < areas.length; i++) expect(areas[i]!).toBeLessThanOrEqual(areas[i - 1]! + 1e-6);
  });

  it('motas y desconchones no se mueven al cambiar Growth', () => {
    const a = run({ growth: 0.3, cracks: 0 }), b = run({ growth: 0.9, cracks: 0 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('trim', () => {
  const run = (params: Record<string, unknown>) => createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 't', type: 'trim', params }] });
  const length = (geo: ReturnType<typeof run>) =>
    geo.shapes.flatMap((s) => s.subpaths).reduce((sum, sp) => {
      let p0 = sp.start, l = 0;
      for (const g of sp.segs) {
        l += Math.hypot(g.p[0] - p0[0], g.p[1] - p0[1]);
        p0 = g.p;
      }
      return sum + l;
    }, 0);
  it('deja la parte pedida de la longitud (cuadrado de 240: la mitad, 120)', () => {
    expect(length(run({ start: 0, end: 0.5 }))).toBeCloseTo(120, 0);
    expect(length(run({ start: 0.25, end: 0.5 }))).toBeCloseTo(60, 0);
  });
  it('en un cerrado, el offset da la vuelta sin perder longitud', () => {
    expect(length(run({ start: 0, end: 0.5, offset: 0.75 }))).toBeCloseTo(120, 0);
  });
  it('end 0: no queda nada', () => {
    expect(run({ start: 0, end: 0 }).shapes.flatMap((s) => s.subpaths)).toHaveLength(0);
  });
});

describe('recortes rápidos', () => {
  it('simplify quita los puntos que sobran y conserva la forma', () => {
    // Un cuadrado con 100 puntos por lado: con tolerancia, quedan sus 4 esquinas.
    const side = (i: number): [number, number][] => Array.from({ length: 100 }, (_, k) => {
      const t = k / 100;
      return ([[t * 10, 0], [10, t * 10], [10 - t * 10, 10], [0, 10 - t * 10]] as [number, number][])[i]!;
    });
    const ring = [...side(0), ...side(1), ...side(2), ...side(3)];
    const out = simplify([[[...ring, ring[0]!]]], 0.01);
    expect(out[0]![0]!.length).toBe(5);
  });

  it('covers: la caja, entera dentro de la superficie o no', () => {
    const sq = [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]] as [number, number][][][];
    expect(covers(sq, { x: 2, y: 2, width: 3, height: 3 })).toBe(true);
    // Un borde la cruza (aunque las esquinas del cuadrado queden lejos).
    expect(covers(sq, { x: 8, y: 2, width: 4, height: 3 })).toBe(false);
    expect(covers(sq, { x: 20, y: 20, width: 3, height: 3 })).toBe(false);
  });
});
