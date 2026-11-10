import { describe, expect, it } from 'vitest';
import { bounds, importSVG, toSVG } from '../src';

const svg = (body: string, attrs = 'viewBox="0 0 100 100"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

describe('importSVG', () => {
  it('convierte un rectángulo en un subtrazado cerrado de cuatro tramos', () => {
    const geo = importSVG(svg('<rect x="10" y="20" width="30" height="40"/>'));
    expect(geo.shapes).toHaveLength(1);
    const sp = geo.shapes[0]!.subpaths[0]!;
    expect(sp.closed).toBe(true);
    expect(sp.segs).toHaveLength(4);
    expect(bounds(geo)).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it('convierte círculos, elipses, líneas y polígonos', () => {
    const geo = importSVG(
      svg('<circle cx="50" cy="50" r="10"/><ellipse cx="0" cy="0" rx="5" ry="2"/><line x1="0" y1="0" x2="1" y2="1"/><polygon points="0,0 10,0 5,5"/>'),
    );
    expect(geo.shapes).toHaveLength(4);
    const circle = bounds({ ...geo, shapes: [geo.shapes[0]!] });
    expect(circle.x).toBeCloseTo(40);
    expect(circle.width).toBeCloseTo(20, 0);
  });

  it('aplica las transformaciones de los grupos y de la forma', () => {
    const geo = importSVG(svg('<g transform="translate(10 0)"><rect transform="scale(2)" width="5" height="5"/></g>'));
    expect(bounds(geo)).toEqual({ x: 10, y: 0, width: 10, height: 10 });
  });

  it('hereda el estilo de los grupos y el atributo style manda', () => {
    const geo = importSVG(svg('<g fill="red" stroke="blue"><rect width="1" height="1" style="fill: green"/></g>'));
    expect(geo.shapes[0]!.style).toMatchObject({ fill: 'green', stroke: 'blue' });
  });

  it('ignora lo que no son formas (defs, texto)', () => {
    const geo = importSVG(svg('<defs><rect width="1" height="1"/></defs><text>hola</text>'));
    expect(geo.shapes).toHaveLength(0);
  });

  it('lee el viewBox o, si no hay, el ancho y el alto', () => {
    expect(importSVG(svg('', 'width="20" height="30"')).viewBox).toEqual([0, 0, 20, 30]);
  });

  it('ida y vuelta: el SVG plano se puede volver a importar igual', () => {
    const a = importSVG(svg('<path d="M10 10 Q 50 0 90 10 L 90 90 Z" fill="#000"/>'));
    const b = importSVG(toSVG(a, { precision: 6 }));
    const [ba, bb] = [bounds(a), bounds(b)];
    for (const k of ['x', 'y', 'width', 'height'] as const) expect(bb[k]).toBeCloseTo(ba[k], 5);
  });
});

describe('hojas de estilo', () => {
  it('aplica las reglas de <style> por clase, id y etiqueta', () => {
    const geo = importSVG(
      svg(
        '<defs><style>.cls-1 { fill: #f40000; } #b { stroke: blue } rect.big, circle { opacity: .5 }</style></defs>' +
          '<path class="cls-1" d="M0 0L1 1"/><rect id="b" class="big" width="1" height="1"/><circle r="1" fill="green" style="fill: pink"/>',
      ),
    );
    expect(geo.shapes[0]!.style.fill).toBe('#f40000');
    expect(geo.shapes[1]!.style).toMatchObject({ stroke: 'blue', opacity: '.5' });
    // El atributo style manda sobre la hoja; la hoja, sobre el atributo suelto.
    expect(geo.shapes[2]!.style.fill).toBe('pink');
  });
});
