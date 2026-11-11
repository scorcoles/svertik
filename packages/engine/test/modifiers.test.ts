import { describe, expect, it } from 'vitest';
import { covers, simplify } from '../src/clip';
import { sampleScene } from '../src/animation';
import { bend, bounds, builtins, createEngine, noise, randomizeParams, resolveParams, rng, spherize, transform, twist, wave, zeroParams, toSVG, type Shape, type StackInput } from '../src';

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
    expect(geo.shapes[1]!.style.fill).toBe('#636363');
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
    expect(run({ fillColor: '#0000ff', fillAmount: 0.5 }).shapes[0]!.style.fill).toBe('#b200b8');
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
    expect(geo.shapes.map((s) => s.style.fill)).toEqual(['#222222', '#636363', '#aeaeae']);
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
    const geo = grid([{ id: 'f', type: 'field', params: { center: [0.5, 0.5], radius: 0.35, softness: 0.5 }, children: [{ id: 'o', type: 'opacity', params: { opacity: 0 } }] }]);
    const o = op(geo);
    // La copia de la izquierda del todo está lejos: casi intacta; las del centro, casi invisibles.
    expect(Math.max(...o)).toBeGreaterThan(0.9);
    expect(Math.min(...o)).toBeLessThan(0.5);
  });

  it('tras un Clone, las fracciones se miden sobre todas las copias, no sobre una', () => {
    // Centro en el borde izquierdo del conjunto y radio pequeño: solo la primera copia.
    const geo = grid([{ id: 'f', type: 'field', params: { center: [0, 0.5], radius: 0.2, softness: 0 }, children: [{ id: 'o', type: 'opacity', params: { opacity: 0 } }] }]);
    expect(op(geo)).toEqual([0, 1, 1, 1]);
  });

  it('en la escena, cada efecto dice sobre qué caja mide (refs)', () => {
    const engine = createEngine(builtins);
    const doc = engine.evaluateDocument({
      version: 2,
      objects: [{ kind: 'shape', id: 'n', name: 'n', shape: 'rectangle', params: { width: 10, height: 10 }, stack: [
        { id: 'before', type: 'spherize' },
        { id: 'c', type: 'clone', params: { mode: 'linear', count: 3, offset: [2, 0] } },
        { id: 'after', type: 'field' },
      ] }],
    });
    const info = doc.nodes.get('n')!;
    expect(info.refs!.before!.width).toBeCloseTo(10);
    expect(info.refs!.c!.width).toBeCloseTo(10);
    expect(info.refs!.after!.width).toBeCloseTo(50);
    expect(info.refs!['']!.width).toBeCloseTo(50);
  });
});

describe('trim con peso', () => {
  it('dentro de Stagger, los trazos se dibujan uno detrás de otro', () => {
    const lines = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><line x1="0" y1="0" x2="100" y2="0" stroke="#000"/><line x1="0" y1="20" x2="100" y2="20" stroke="#000"/><line x1="0" y1="40" x2="100" y2="40" stroke="#000"/></svg>';
    const len = (progress: number) =>
      createEngine(builtins)
        .evaluateStack({ source: lines, stack: [{ id: 's', type: 'stagger', params: { progress, stagger: 1, ease: 'linear' }, children: [{ id: 't', type: 'trim', params: { end: 0 } }] }] })
        .shapes.map((sh) => Math.round(sh.subpaths.reduce((sum, sp) => sum + sp.segs.reduce((a, g, i) => a + Math.hypot(g.p[0] - (i ? sp.segs[i - 1]!.p[0] : sp.start[0]), g.p[1] - (i ? sp.segs[i - 1]!.p[1] : sp.start[1])), 0), 0)));
    expect(len(0)).toEqual([0, 0, 0]);
    expect(len(0.5)).toEqual([100, 50, 0]);
    expect(len(1)).toEqual([100, 100, 100]);
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

describe('bones', () => {
  // Una barra larga (100 × 10), con la cadena de izquierda a derecha.
  const bar = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 10"><rect width="100" height="10"/></svg>';
  const run = (params: Record<string, unknown>) => createEngine(builtins).evaluateStack({ source: bar, stack: [{ id: 'b', type: 'bones', params }] });
  const tip = (geo: ReturnType<typeof run>) => {
    // El punto más alejado del origen de la cadena: la punta.
    const pts = geo.shapes.flatMap((s) => s.subpaths.flatMap((sp) => [sp.start, ...sp.segs.map((g) => g.p)]));
    return pts.reduce((best, q) => (Math.hypot(q[0], q[1] - 5) > Math.hypot(best[0], best[1] - 5) ? q : best));
  };

  it('con los ángulos a 0, el dibujo como estaba', () => {
    expect(bounds(run({ angle1: 0, angle2: 0, angle3: 0, angle4: 0 }))).toEqual({ x: 0, y: 0, width: 100, height: 10 });
  });

  it('cada hueso gira sobre su articulación: doblar el último solo mueve la punta', () => {
    const geo = run({ segments: 2, angle1: 0, angle2: 90, smooth: 0 });
    const b = bounds(geo);
    // El primer hueso (0–50) se queda; el segundo baja en vertical desde x ≈ 50.
    expect(b.x).toBeCloseTo(0, 0);
    expect(b.x + b.width).toBeLessThan(60);
    expect(b.y + b.height).toBeGreaterThan(50);
  });

  it('IK: la punta llega al objetivo', () => {
    // Objetivo (en fracciones de la barra): x = 60, y = 40.
    const [x, y] = tip(run({ segments: 3, ik: true, target: [0.6, 4], smooth: 0 }));
    expect(Math.hypot(x - 60, y - 40)).toBeLessThan(6);
  });
});

describe('glitch sobre trazos (sin relleno)', () => {
  const rings = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g fill="none" stroke="#ededed" stroke-width="2"><circle cx="100" cy="100" r="40"/><circle cx="100" cy="100" r="80"/></g></svg>';
  const vline = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><line x1="50" y1="0" x2="50" y2="100" stroke="#000"/><line x1="0" y1="50" x2="100" y2="50" stroke="#000" fill="none"/></svg>';
  const run = (source: string, type: string, params: Record<string, unknown>) => createEngine(builtins).evaluateStack({ source, stack: [{ id: 'g', type, params }] });
  const length = (geo: ReturnType<typeof run>) =>
    geo.shapes.reduce((sum, s) => sum + s.subpaths.reduce((a, sp) => a + sp.segs.reduce((b, g, i) => b + Math.hypot(g.p[0] - (i ? sp.segs[i - 1]!.p[0] : sp.start[0]), g.p[1] - (i ? sp.segs[i - 1]!.p[1] : sp.start[1])), 0), 0), 0);
  const points = (geo: ReturnType<typeof run>) => JSON.stringify(geo.shapes.map((s) => s.subpaths));

  it('Blocks corta y desplaza los anillos (antes no hacía nada)', () => {
    const before = run(rings, 'blocks', { count: 0 });
    const after = run(rings, 'blocks', { count: 12, size: 0.15, shift: 0.1, seed: 3 });
    expect(points(after)).not.toBe(points(before));
    expect(before.shapes).toHaveLength(2);
    // Mueve trozos, no los pierde: la longitud total es la de los dos anillos (2π · 120).
    expect(length(after)).toBeCloseTo(2 * Math.PI * 120, 0);
    expect(after.shapes.every((s) => s.style.fill === 'none' && s.style.stroke === '#ededed')).toBe(true);
  });

  it('Slices: cada franja, un elemento; la longitud se conserva', () => {
    const geo = run(vline, 'slices', { count: 5, chance: 1, shift: 0.1 });
    expect(length(geo)).toBeCloseTo(200, 0);
    expect(new Set(geo.shapes.map((s) => s.clone)).size).toBe(5);
  });

  it('Scanlines quita los tramos que caen en las rayitas', () => {
    const geo = run(vline, 'scanlines', { count: 10, width: 2 });
    // La vertical pierde 10 × 2 px; la horizontal (y = 50) cae justo entre dos rayitas y no pierde nada.
    expect(length(geo)).toBeCloseTo(180, 0);
  });
});

describe('streaks', () => {
  it('con Bite, cada raya deja un hueco en la forma; con 0, la forma queda intacta', () => {
    const square = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#777"/></svg>';
    const run = (bite: number) => createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 's', type: 'streaks', params: { count: 5, width: 4, bite, seed: 2 } }] });
    const intact = run(0).shapes[0]!;
    expect(intact.subpaths).toHaveLength(1);
    expect(intact.subpaths[0]!.segs).toHaveLength(4);
    // Con hueco, el contorno del cuadrado tiene más vértices (las muescas).
    const bitten = run(1).shapes[0]!;
    expect(bitten.subpaths.reduce((n, sp) => n + sp.segs.length, 0)).toBeGreaterThan(4 + 5 * 3);
  });

  it('lo que sale por un lado falta por el otro, del mismo largo con Bite 1', () => {
    const square = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#777"/></svg>';
    const geo = createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 's', type: 'streaks', params: { count: 1, width: 4, bite: 1, seed: 7 } }] });
    const [shape, bar] = geo.shapes;
    const xs = (sh: typeof shape) => sh!.subpaths.flatMap((sp) => [sp.start, ...sp.segs.map((g) => g.p)]).map((q) => q[0]);
    const barX = xs(bar);
    const barLen = Math.max(...barX) - Math.min(...barX);
    const outLeft = Math.min(...barX) < 0;
    // La muesca: los vértices del cuadrado que no están en sus esquinas ni en sus lados de arriba y abajo.
    const notch = shape!.subpaths.flatMap((sp) => [sp.start, ...sp.segs.map((g) => g.p)]).filter((q) => q[1] > 0.5 && q[1] < 199.5 && q[0] > 0.5 && q[0] < 199.5).map((q) => q[0]);
    expect(notch.length).toBeGreaterThan(0);
    // Sale por la izquierda: la muesca está a la derecha, y entra lo mismo que asoma la raya.
    if (outLeft) expect(200 - Math.min(...notch)).toBeCloseTo(barLen, 0);
    else expect(Math.max(...notch)).toBeCloseTo(barLen, 0);
  });

  it('cada raya sale del contorno real (en un círculo, no de su caja)', () => {
    const circle = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="100" fill="#777"/></svg>';
    const geo = createEngine(builtins).evaluateStack({ source: circle, stack: [{ id: 's', type: 'streaks', params: { count: 40, length: 0.1, width: 1, seed: 3 } }] });
    const streaks = geo.shapes.slice(1);
    expect(streaks).toHaveLength(40);
    for (const s of streaks) {
      const pts = [s.subpaths[0]!.start, ...s.subpaths[0]!.segs.map((g) => g.p)];
      const xs = pts.map((q) => q[0]), y = (Math.min(...pts.map((q) => q[1])) + Math.max(...pts.map((q) => q[1]))) / 2;
      // El borde del círculo a esa altura.
      const half = Math.sqrt(Math.max(0, 100 ** 2 - (y - 100) ** 2));
      const [e0, e1] = [100 - half, 100 + half];
      const touches = (x: number) => Math.min(...xs) - 1 <= x && x <= Math.max(...xs) + 1;
      expect(touches(e0) || touches(e1)).toBe(true);
    }
  });
});

describe('rgb split', () => {
  const two = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20"><rect x="0" y="0" width="20" height="20" fill="#fff"/><rect x="60" y="0" width="20" height="20" fill="#fff"/></svg>';
  const xOf = (s: Shape) => s.subpaths[0]!.start[0];
  it('dos copias de color, desplazadas a cada lado, detrás del dibujo', () => {
    const geo = createEngine(builtins).evaluateStack({ source: two, stack: [{ id: 'r', type: 'rgbsplit', params: { distance: 5 } }] });
    expect(geo.shapes.map((s) => s.style.fill)).toEqual(['#00e5ff', '#00e5ff', '#ff2bd6', '#ff2bd6', '#fff', '#fff']);
    expect(xOf(geo.shapes[0]!) - xOf(geo.shapes[4]!)).toBeCloseTo(-5);
    expect(xOf(geo.shapes[2]!) - xOf(geo.shapes[4]!)).toBeCloseTo(5);
  });
  it('delante y con modo de fusión', () => {
    const geo = createEngine(builtins).evaluateStack({ source: two, stack: [{ id: 'r', type: 'rgbsplit', params: { distance: 5, layer: 'front', blend: 'screen' } }] });
    expect(geo.shapes[0]!.style.fill).toBe('#fff');
    expect(geo.shapes.at(-1)!.style['mix-blend-mode']).toBe('screen');
  });
  it('sin el original: solo las dos copias', () => {
    const geo = createEngine(builtins).evaluateStack({ source: two, stack: [{ id: 'r', type: 'rgbsplit', params: { distance: 5, original: false } }] });
    expect(geo.shapes.map((s) => s.style.fill)).toEqual(['#00e5ff', '#00e5ff', '#ff2bd6', '#ff2bd6']);
  });
  it('dentro de Step, cada elemento con su distancia (la 2.ª, el doble)', () => {
    const geo = createEngine(builtins).evaluateStack({ source: two, stack: [{ id: 's', type: 'step', children: [{ id: 'r', type: 'rgbsplit', params: { distance: 4 } }] }] });
    const cyan = geo.shapes.filter((s) => s.style.fill === '#00e5ff').map(xOf);
    expect(cyan).toEqual([-4, 52]);
  });
});

describe('rgb split con efectos dentro (solo a las copias)', () => {
  const scene = (children: { id: string; type: string; params?: Record<string, unknown>; children?: unknown[] }[]) => ({
    version: 2 as const,
    objects: [{ kind: 'shape' as const, id: 'n', name: 'n', shape: 'rectangle', params: { width: 100, height: 40, fillColor: '#ffffff' }, transform: { x: 50 }, stack: [{ id: 'r', type: 'rgbsplit', params: { distance: 6 }, children: children as never }] }],
  });
  it('Blur dentro: un <filter> solo para las copias; el dibujo, sin él', () => {
    const geo = createEngine(builtins).evaluateDocument(scene([{ id: 'b', type: 'blur', params: { amount: 3 } }])).geometry;
    const ids = Object.keys(geo.filters ?? {});
    expect(ids).toHaveLength(1);
    const [copyA, copyB, original] = geo.shapes;
    expect(copyA!.wrap).toEqual([ids[0]]);
    expect(copyB!.wrap).toEqual([ids[0]]);
    expect(original!.wrap ?? []).toEqual([]);
    expect(createEngine(builtins).toSVG(scene([{ id: 'b', type: 'blur', params: { amount: 3 } }]))).toContain('feGaussianBlur');
  });
  it('Transform dentro: mueve las copias, no el dibujo', () => {
    const plain = createEngine(builtins).evaluateDocument(scene([])).geometry.shapes;
    const moved = createEngine(builtins).evaluateDocument(scene([{ id: 't', type: 'transform', params: { y: 10 } }])).geometry.shapes;
    expect(moved[2]!.subpaths[0]!.start).toEqual(plain[2]!.subpaths[0]!.start);
    expect(moved[0]!.subpaths[0]!.start[1]).toBeCloseTo(plain[0]!.subpaths[0]!.start[1] + 10);
  });
  it('sin colocar en una escena (evaluateStack), un filtro de dentro no rompe el SVG', () => {
    const src = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
    const geo = createEngine(builtins).evaluateStack({ source: src, stack: [{ id: 'r', type: 'rgbsplit', params: { distance: 2 }, children: [{ id: 'b', type: 'blur' }] }] });
    expect(toSVG(geo)).not.toContain('filter=');
  });
  it('detrás de RGB Split, otro efecto no pierde el filtro de las copias', () => {
    const s = scene([{ id: 'b', type: 'blur', params: { amount: 3 } }]);
    s.objects[0]!.stack.push({ id: 'w', type: 'wave', children: undefined as never, params: { amplitude: 0.02 } as never });
    expect(Object.keys(createEngine(builtins).evaluateDocument(s).geometry.filters ?? {})).toHaveLength(1);
  });
});

describe('round corners', () => {
  const run = (params: Record<string, unknown>, source = square) =>
    createEngine(builtins).evaluateStack({ source, stack: [{ id: 'r', type: 'roundcorners', params }] });
  const segs = (geo: ReturnType<typeof run>) => geo.shapes[0]!.subpaths[0]!.segs;
  const anchors = (geo: ReturnType<typeof run>) => {
    const sp = geo.shapes[0]!.subpaths[0]!;
    return [sp.start, ...sp.segs.map((s) => s.p)];
  };

  it('cuadrado: 4 lados + 4 arcos; la caja no cambia y las esquinas desaparecen', () => {
    const geo = run({ radius: 10 });
    expect(segs(geo)).toHaveLength(8);
    const b = bounds(geo);
    expect(b.x).toBeCloseTo(20);
    expect(b.width).toBeCloseTo(60);
    // Ningún ancla en una esquina; los cortes, a 10 de ella.
    for (const p of anchors(geo)) expect(Math.hypot(p[0] - 20, p[1] - 20)).toBeGreaterThan(9.9);
    expect(anchors(geo).some((p) => Math.abs(p[0] - 30) < 1e-6 && Math.abs(p[1] - 20) < 1e-6)).toBe(true);
  });

  it('el arco pasa por donde pasaría un círculo de ese radio', () => {
    const geo = run({ radius: 10 });
    const sp = geo.shapes[0]!.subpaths[0]!;
    // Punto medio de cada arco: a 10 del centro de su redondeo (p. ej. (30, 30) en la esquina de arriba a la izquierda).
    let p0 = sp.start;
    const mids: (readonly [number, number])[] = [];
    for (const s of sp.segs) {
      const m = [0.125 * p0[0] + 0.375 * s.c1[0] + 0.375 * s.c2[0] + 0.125 * s.p[0], 0.125 * p0[1] + 0.375 * s.c1[1] + 0.375 * s.c2[1] + 0.125 * s.p[1]] as const;
      if (Math.abs(p0[0] - s.p[0]) > 1e-6 && Math.abs(p0[1] - s.p[1]) > 1e-6) mids.push(m);
      p0 = s.p;
    }
    expect(mids).toHaveLength(4);
    const tl = mids.find((m) => m[0] < 50 && m[1] < 50)!;
    expect(Math.hypot(tl[0] - 30, tl[1] - 30)).toBeCloseTo(10, 1);
  });

  it('el radio se encoge si no cabe (como mucho, medio lado)', () => {
    const geo = run({ radius: 400 });
    const b = bounds(geo);
    expect(b.width).toBeCloseTo(60);
    expect(segs(geo).length).toBeGreaterThanOrEqual(4);
  });

  it('el límite deja las esquinas más abiertas que él', () => {
    // Las del cuadrado son de 90°: con límite 80, ninguna.
    expect(segs(run({ radius: 10, limit: 80 }))).toHaveLength(4);
    expect(segs(run({ radius: 10, limit: 90 }))).toHaveLength(8);
  });

  it('chamfer: corta en recta; radio 0 y un círculo no cambian', () => {
    const geo = run({ radius: 10, shape: 'chamfer' });
    const sp = geo.shapes[0]!.subpaths[0]!;
    expect(sp.segs).toHaveLength(8);
    const circle = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30"/></svg>';
    const before = createEngine(builtins).evaluateStack({ source: circle, stack: [] });
    expect(JSON.stringify(run({ radius: 10 }, circle).shapes[0]!.subpaths)).toBe(JSON.stringify(before.shapes[0]!.subpaths));
    expect(JSON.stringify(run({ radius: 0 }).shapes[0]!.subpaths)).toBe(JSON.stringify(createEngine(builtins).evaluateStack({ source: square, stack: [] }).shapes[0]!.subpaths));
  });

  it('en un trazado abierto, los extremos no se tocan', () => {
    const polyline = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polyline points="10,90 50,10 90,90" fill="none" stroke="black"/></svg>';
    const geo = run({ radius: 10 }, polyline);
    const sp = geo.shapes[0]!.subpaths[0]!;
    expect(sp.segs).toHaveLength(3);
    expect(sp.start[0]).toBeCloseTo(10);
    expect(sp.segs[2]!.p[0]).toBeCloseTo(90);
  });
});

describe('metaball', () => {
  const circle = (id: string, x: number, r: number) => ({ kind: 'shape' as const, id, name: id, shape: 'ellipse', params: { width: 2 * r, height: 2 * r }, stack: [], transform: { x } });
  const run = (gap: number, params: Record<string, unknown> = {}) =>
    createEngine(builtins).evaluateDocument({
      version: 2,
      objects: [{ kind: 'group', id: 'g', name: 'g', stack: [{ id: 'm', type: 'metaball', params: { reach: 40, ...params } }], children: [circle('a', -gap / 2, 50), circle('b', gap / 2, 35)] }],
    }).geometry;
  const loops = (geo: ReturnType<typeof run>) => geo.shapes.flatMap((s) => s.subpaths).filter((sp) => sp.closed).length;

  it('lejos (más que Reach entre bordes): dos formas; cerca: una sola, más ancha que los dos círculos juntos', () => {
    expect(loops(run(140))).toBe(2);
    expect(loops(run(90))).toBe(1);
    const b = bounds(run(90));
    // Los círculos van de -95 a 80; la gota casi igual (la unión suave no se sale por los extremos).
    expect(b.x).toBeGreaterThan(-97);
    expect(b.x + b.width).toBeLessThan(82);
  });

  it('el contorno sigue al círculo donde no hay fusión (error menor que una celda)', () => {
    const geo = run(140);
    const pts = geo.shapes.flatMap((s) => s.subpaths).flatMap((sp) => [sp.start, ...sp.segs.map((g) => g.p)]);
    const big = pts.filter((q) => q[0] < 0);
    for (const q of big) expect(Math.abs(Math.hypot(q[0] + 70, q[1]) - 50)).toBeLessThan(1.5);
  });

  it('Reach 0: como una unión normal; Grow engorda', () => {
    expect(loops(run(90, { reach: 0 }))).toBe(2);
    expect(bounds(run(140, { grow: 10 })).width).toBeGreaterThan(bounds(run(140)).width + 18);
  });

  it('un anillo (con agujero) conserva el agujero en sentido contrario', () => {
    const ringSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 50a50 50 0 1 0 100 0a50 50 0 1 0-100 0zM25 50a25 25 0 1 1 50 0a25 25 0 1 1-50 0z" fill-rule="evenodd"/></svg>';
    const geo = createEngine(builtins).evaluateStack({ source: ringSvg, stack: [{ id: 'm', type: 'metaball', params: { reach: 5 } }] });
    const sps = geo.shapes[0]!.subpaths;
    expect(sps).toHaveLength(2);
    const area = (sp: (typeof sps)[number]) => {
      const p = [sp.start, ...sp.segs.map((g) => g.p)];
      return p.reduce((s, q, i) => s + q[0] * p[(i + 1) % p.length]![1] - p[(i + 1) % p.length]![0] * q[1], 0);
    };
    expect(Math.sign(area(sps[0]!))).not.toBe(Math.sign(area(sps[1]!)));
  });

  it('rápido: dos círculos, menos de 60 ms', () => {
    run(90);
    const t0 = performance.now();
    run(91);
    expect(performance.now() - t0).toBeLessThan(60);
  });
});

describe('follow path', () => {
  // Un cuadrado de 10 que recorre una línea de (0,0) a (200,0) (y un círculo cerrado de radio 100).
  const box = (params: Record<string, unknown>, path: Record<string, unknown> = { kind: 'shape', id: 'p', name: 'p', shape: 'line', params: { length: 200 }, stack: [], transform: { x: 100 } }) =>
    createEngine(builtins).evaluateDocument({
      version: 2,
      objects: [
        { kind: 'shape', id: 'b', name: 'b', shape: 'rectangle', params: { width: 10, height: 10 }, stack: [{ id: 'f', type: 'followpath', params: { target: 'p', ...params } }], transform: { x: -500, y: 300 } },
        path,
      ],
    } as never).nodes.get('b')!.box;
  const centre = (b: { x: number; y: number; width: number; height: number }) => [b.x + b.width / 2, b.y + b.height / 2];

  it('va al punto del trazado que dice Position, esté donde esté el objeto', () => {
    const [x0, y0] = centre(box({ position: 0 }));
    expect(x0).toBeCloseTo(0, 0);
    expect(y0).toBeCloseTo(0, 0);
    expect(centre(box({ position: 0.5 }))[0]).toBeCloseTo(100, 0);
    // En uno abierto no se sale por el final.
    expect(centre(box({ position: 1 }))[0]).toBeCloseTo(200, 0);
  });

  it('Offset lo aparta a un lado; Orient lo gira con el trazado', () => {
    expect(centre(box({ position: 0.5, offset: 20 }))[1]).toBeCloseTo(20, 0);
    const circle = { kind: 'shape', id: 'p', name: 'p', shape: 'ellipse', params: { width: 200, height: 200 }, stack: [] };
    // Un rectángulo alargado: tumbado donde el círculo va en vertical si gira; igual si no.
    const long = (orient: boolean) =>
      createEngine(builtins).evaluateDocument({
        version: 2,
        objects: [
          { kind: 'shape', id: 'b', name: 'b', shape: 'rectangle', params: { width: 40, height: 4 }, stack: [{ id: 'f', type: 'followpath', params: { target: 'p', position: 0, orient } }] },
          circle,
        ],
      } as never).nodes.get('b')!.box;
    const a = long(true), b = long(false);
    expect(a.height).toBeGreaterThan(a.width);
    expect(b.width).toBeGreaterThan(b.height);
  });

  it('sin trazado, se queda como está', () => {
    expect(box({ target: '' }).x).toBeCloseTo(-505);
  });
});

describe('connect', () => {
  const sq = (id: string, x: number, y = 0) => ({ kind: 'shape' as const, id, name: id, shape: 'rectangle', params: { width: 40, height: 40 }, stack: [], transform: { x, y } });
  const run = (params: Record<string, unknown>, a = sq('a', 0), b = sq('b', 200)) => {
    const doc = createEngine(builtins).evaluateDocument({
      version: 2,
      objects: [
        { kind: 'shape', id: 'l', name: 'l', shape: 'line', params: { strokeColor: '#ff0000' }, stack: [{ id: 'c', type: 'connect', params: { from: 'a', to: 'b', ...params } }], transform: { x: 999, y: -50 } },
        a,
        b,
      ],
    } as never);
    return doc.geometry.shapes.filter((s) => s.node === 'l');
  };
  const ends = (shapes: ReturnType<typeof run>) => {
    const sp = shapes[0]!.subpaths[0]!;
    return [sp.start, sp.segs[sp.segs.length - 1]!.p] as const;
  };

  it('de borde a borde, con su hueco, esté donde esté la línea; con el estilo de la línea', () => {
    const shapes = run({});
    const [s, e] = ends(shapes);
    // Bordes en x = 20 y x = 180; hueco de 6 (con la precisión del muestreo).
    expect(s[0]).toBeCloseTo(26, 0);
    expect(e[0]).toBeCloseTo(174, 0);
    expect(s[1]).toBeCloseTo(0);
    expect(shapes[0]!.style.stroke).toBe('#ff0000');
    expect(shapes[0]!.style.fill).toBe('none');
  });

  it('sin Edges, de centro a centro; sigue a los objetos si se mueven', () => {
    const [s, e] = ends(run({ edges: false, gap: 0 }, sq('a', 0), sq('b', 100, 100)));
    expect(s[0]).toBeCloseTo(0);
    expect(e[0]).toBeCloseTo(100);
    expect(e[1]).toBeCloseTo(100);
  });

  it('arc se curva a un lado; arrow añade la punta; sin objetos, nada cambia', () => {
    const arc = run({ shape: 'arc', bend: 0.3 });
    expect(Math.min(...arc[0]!.subpaths[0]!.segs.flatMap((g) => [g.c1[1], g.c2[1]]))).not.toBeCloseTo(0);
    expect(run({ arrow: 'both' })[0]!.subpaths).toHaveLength(3);
    expect(run({ from: '' })[0]!.subpaths[0]!.segs).toHaveLength(1);
  });
});

describe('trace', () => {
  // Un cuadrado que va de x = 0 a x = 100 en 1 s (lineal), y la línea con Trace detrás.
  const scene = (params: Record<string, unknown> = {}) => ({
    version: 2,
    objects: [
      { kind: 'shape', id: 'b', name: 'b', shape: 'rectangle', params: { width: 10, height: 10 }, stack: [] },
      { kind: 'shape', id: 'l', name: 'l', shape: 'line', params: { strokeColor: '#00ff00' }, stack: [{ id: 't', type: 'trace', params: { target: 'b', length: 0.5, samples: 10, smooth: false, ...params } }], transform: { x: 40, y: 70 } },
    ],
    animation: { duration: 1, tracks: [{ id: 'k', node: 'b', on: 'node', param: 'x', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 1, value: 100, ease: 'linear' }] }] },
  }) as never;
  const trail = (e: ReturnType<typeof createEngine>, t: number, params?: Record<string, unknown>) => {
    return e.evaluateDocument(sampleScene(scene(params), t)).geometry.shapes.filter((s) => s.node === 'l');
  };

  it('en 0,8 s: de donde estaba hace 0,5 s (x ≈ 30) hasta donde está (80), con el estilo de la línea', () => {
    const e = createEngine(builtins);
    const shapes = trail(e, 0.8);
    const sp = shapes[0]!.subpaths[0]!;
    const xs = [sp.start, ...sp.segs.map((g) => g.p)].map((q) => q[0]);
    expect(Math.min(...xs)).toBeCloseTo(30, 0);
    expect(Math.max(...xs)).toBeCloseTo(80, 5);
    expect(sp.segs.length).toBeGreaterThanOrEqual(9);
    expect(shapes[0]!.style.stroke).toBe('#00ff00');
  });

  it('al principio aún no hay estela; sin instante (la escena quieta), tampoco', () => {
    const e = createEngine(builtins);
    expect(trail(e, 0)).toHaveLength(0);
    expect(e.evaluateDocument(scene()).geometry.shapes.filter((s) => s.node === 'l')).toHaveLength(0);
  });

  it('cambia con el tiempo (no se queda en caché) y da lo mismo yendo hacia atrás', () => {
    const e = createEngine(builtins);
    const end = (t: number) => {
      const sp = trail(e, t)[0]!.subpaths[0]!;
      return sp.segs[sp.segs.length - 1]!.p[0];
    };
    expect(end(0.5)).toBeCloseTo(50, 5);
    expect(end(0.6)).toBeCloseTo(60, 5);
    expect(end(0.5)).toBeCloseTo(50, 5);
  });
});

describe('look at', () => {
  // Un rectángulo alargado (frente a la derecha) en el origen y un punto (círculo) al que mirar.
  const run = (params: Record<string, unknown>, tx: number, ty: number) =>
    createEngine(builtins).evaluateDocument({
      version: 2,
      objects: [
        { kind: 'shape', id: 'a', name: 'a', shape: 'rectangle', params: { width: 60, height: 6 }, stack: [{ id: 'l', type: 'lookat', params: { target: 't', ...params } }] },
        { kind: 'shape', id: 't', name: 't', shape: 'ellipse', params: { width: 10, height: 10 }, stack: [], transform: { x: tx, y: ty } },
      ],
    } as never).nodes.get('a')!.box;

  it('gira para mirarlo (abajo: vertical; a la derecha: igual) sin moverse', () => {
    const down = run({}, 0, 200);
    expect(down.height).toBeCloseTo(60, 0);
    expect(down.x + down.width / 2).toBeCloseTo(0, 5);
    expect(run({}, 200, 0).width).toBeCloseTo(60, 0);
  });

  it('Facing dice qué lado es el frente; Amount, cuánto gira', () => {
    expect(run({ facing: 90 }, 0, 200).width).toBeCloseTo(60, 0);
    // A medias, 45°: la caja es casi cuadrada.
    const half = run({ amount: 0.5 }, 0, 200);
    expect(Math.abs(half.width - half.height)).toBeLessThan(1);
  });
});

describe('trace en bucle', () => {
  it('al empezar una vuelta, la estela sigue con el final de la anterior', () => {
    const scene = {
      version: 2,
      objects: [
        { kind: 'shape', id: 'b', name: 'b', shape: 'rectangle', params: { width: 10, height: 10 }, stack: [] },
        { kind: 'shape', id: 'l', name: 'l', shape: 'line', params: {}, stack: [{ id: 't', type: 'trace', params: { target: 'b', length: 0.5, samples: 10, smooth: false } }] },
      ],
      animation: { duration: 1, loop: true, tracks: [{ id: 'k', node: 'b', on: 'node', param: 'x', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 1, value: 100, ease: 'linear' }] }] },
    } as never;
    const geo = createEngine(builtins).evaluateDocument(sampleScene(scene, 0.1)).geometry.shapes.find((s) => s.node === 'l')!;
    const xs = [geo.subpaths[0]!.start, ...geo.subpaths[0]!.segs.map((g) => g.p)].map((q) => q[0]);
    expect(Math.max(...xs)).toBeGreaterThan(80);
    expect(xs[xs.length - 1]).toBeCloseTo(10, 5);
  });
});

describe('pixelate', () => {
  const two = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="100" height="100" fill="#ff0000"/><circle cx="50" cy="50" r="30" fill="#0000ff"/></svg>';
  const run = (params: Record<string, unknown>, source = two) => createEngine(builtins).evaluateStack({ source, stack: [{ id: 'p', type: 'pixelate', params }] });

  it('cuadraditos del color de lo que hay encima; tiras por fila', () => {
    const geo = run({ size: 10 });
    const fills = geo.shapes.map((s) => s.style.fill).sort();
    expect(fills).toEqual(['#0000ff', '#ff0000']);
    const blue = geo.shapes.find((s) => s.style.fill === '#0000ff')!;
    // El centro (50, 50) es azul; la esquina, roja. Todo en múltiplos de 10.
    for (const sp of blue.subpaths) for (const q of [sp.start, ...sp.segs.map((g) => g.p)]) {
      expect(q[0] % 10).toBeCloseTo(0);
      expect(q[1] % 10).toBeCloseTo(0);
    }
    // Una tira por fila de color seguido (no un cuadrado por píxel).
    expect(blue.subpaths.length).toBeLessThanOrEqual(6);
  });

  it('con gap o puntos, un trazado por píxel; con size 0, nada cambia', () => {
    expect(run({ size: 10, gap: 2 }).shapes.reduce((n, s) => n + s.subpaths.length, 0)).toBe(100);
    expect(run({ size: 10, shape: 'dot' }).shapes.reduce((n, s) => n + s.subpaths.length, 0)).toBe(100);
    expect(run({ size: 0 }).shapes).toHaveLength(2);
  });

  it('una línea (solo trazo) también se pixela, con su color de trazo', () => {
    const ln = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><line x1="0" y1="5" x2="100" y2="5" stroke="#00ff00" stroke-width="10"/></svg>';
    const geo = run({ size: 10 }, ln);
    expect(geo.shapes).toHaveLength(1);
    expect(geo.shapes[0]!.style.fill).toBe('#00ff00');
  });
});

describe('trazo discontinuo y por detrás', () => {
  it('primitivas y Paint escriben dasharray, dashoffset y paint-order solo si hace falta', async () => {
    const { buildShape } = await import('../src/shapes');
    const st = (p: Record<string, unknown>) => buildShape('rectangle', { stroke: true, ...p }).shapes[0]!.style;
    expect(st({})['stroke-dasharray']).toBeUndefined();
    expect(st({ dash: 6 })['stroke-dasharray']).toBe('6 6');
    expect(st({ dash: 6, gap: 2, dashOffset: 3 })).toMatchObject({ 'stroke-dasharray': '6 2', 'stroke-dashoffset': '3' });
    expect(st({ behind: true })['paint-order']).toBe('stroke');
    // Sin trazo, nada.
    expect(buildShape('rectangle', { dash: 6 }).shapes[0]!.style['stroke-dasharray']).toBeUndefined();
    const geo = createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'p', type: 'paint', params: { stroke: true, dash: 4, behind: true } }] });
    expect(geo.shapes[0]!.style).toMatchObject({ 'stroke-dasharray': '4 4', 'paint-order': 'stroke' });
  });
});
