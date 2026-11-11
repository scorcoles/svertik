import { describe, expect, it } from 'vitest';
import { bounds, importSVG, toSVG } from '../src';

const svg = (body: string, attrs = 'viewBox="0 0 100 100"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

describe('importSVG', () => {
  it('turns a rectangle into a closed subpath of four segments', () => {
    const geo = importSVG(svg('<rect x="10" y="20" width="30" height="40"/>'));
    expect(geo.shapes).toHaveLength(1);
    const sp = geo.shapes[0]!.subpaths[0]!;
    expect(sp.closed).toBe(true);
    expect(sp.segs).toHaveLength(4);
    expect(bounds(geo)).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it('converts circles, ellipses, lines and polygons', () => {
    const geo = importSVG(
      svg('<circle cx="50" cy="50" r="10"/><ellipse cx="0" cy="0" rx="5" ry="2"/><line x1="0" y1="0" x2="1" y2="1"/><polygon points="0,0 10,0 5,5"/>'),
    );
    expect(geo.shapes).toHaveLength(4);
    const circle = bounds({ ...geo, shapes: [geo.shapes[0]!] });
    expect(circle.x).toBeCloseTo(40);
    expect(circle.width).toBeCloseTo(20, 0);
  });

  it('applies the transforms of the groups and of the shape', () => {
    const geo = importSVG(svg('<g transform="translate(10 0)"><rect transform="scale(2)" width="5" height="5"/></g>'));
    expect(bounds(geo)).toEqual({ x: 10, y: 0, width: 10, height: 10 });
  });

  it('inherits the style of groups and the style attribute wins', () => {
    const geo = importSVG(svg('<g fill="red" stroke="blue"><rect width="1" height="1" style="fill: green"/></g>'));
    expect(geo.shapes[0]!.style).toMatchObject({ fill: 'green', stroke: 'blue' });
  });

  it('ignores what is not a shape (defs, text)', () => {
    const geo = importSVG(svg('<defs><rect width="1" height="1"/></defs><text>hola</text>'));
    expect(geo.shapes).toHaveLength(0);
  });

  it('expands <use>, with its position, transform and opacity', () => {
    const geo = importSVG(
      svg(
        '<defs><rect id="r" width="10" height="10" fill="red"/><g id="g"><rect width="4" height="4"/></g></defs>' +
          '<use href="#r" x="20" y="30"/><use xlink:href="#g" transform="translate(50 0)" opacity="0.5"/>',
        'viewBox="0 0 100 100" xmlns:xlink="http://www.w3.org/1999/xlink"',
      ),
    );
    expect(geo.shapes).toHaveLength(2);
    expect(bounds({ ...geo, shapes: [geo.shapes[0]!] })).toEqual({ x: 20, y: 30, width: 10, height: 10 });
    expect(bounds({ ...geo, shapes: [geo.shapes[1]!] })).toEqual({ x: 50, y: 0, width: 4, height: 4 });
    expect(geo.shapes[0]!.style.fill).toBe('red');
    expect(geo.shapes[1]!.style.opacity).toBe('0.5');
  });

  it('expands <use> chains and only draws a <symbol> when it is used', () => {
    const geo = importSVG(
      svg(
        '<defs><g id="a"><path d="M0 0L1 1"/><use href="#b"/></g><g id="b"><path d="M0 0L2 2"/></g></defs>' +
          '<symbol id="s"><rect width="3" height="3"/></symbol>' +
          '<use href="#a"/><use href="#s" x="10"/>',
      ),
    );
    // Two paths from the chain and the symbol's rectangle; the symbol alone is not drawn.
    expect(geo.shapes).toHaveLength(3);
    expect(bounds({ ...geo, shapes: [geo.shapes[2]!] })).toEqual({ x: 10, y: 0, width: 3, height: 3 });
  });

  it('multiplies the opacity of groups and <use>', () => {
    const geo = importSVG(svg('<g opacity="0.5"><rect width="1" height="1" opacity="0.4"/></g>'));
    expect(geo.shapes[0]!.style.opacity).toBe('0.2');
  });

  it('does not loop with a <use> that points back', () => {
    const geo = importSVG(svg('<g id="a"><use href="#a"/><rect width="1" height="1"/></g>'));
    expect(geo.shapes).toHaveLength(1);
  });

  it('reads the viewBox or, without one, the width and height', () => {
    expect(importSVG(svg('', 'width="20" height="30"')).viewBox).toEqual([0, 0, 20, 30]);
  });

  it('round trip: the plain SVG can be imported again the same', () => {
    const a = importSVG(svg('<path d="M10 10 Q 50 0 90 10 L 90 90 Z" fill="#000"/>'));
    const b = importSVG(toSVG(a, { precision: 6 }));
    const [ba, bb] = [bounds(a), bounds(b)];
    for (const k of ['x', 'y', 'width', 'height'] as const) expect(bb[k]).toBeCloseTo(ba[k], 5);
  });
});

describe('style sheets', () => {
  it('applies <style> rules by class, id and tag', () => {
    const geo = importSVG(
      svg(
        '<defs><style>.cls-1 { fill: #f40000; } #b { stroke: blue } rect.big, circle { opacity: .5 }</style></defs>' +
          '<path class="cls-1" d="M0 0L1 1"/><rect id="b" class="big" width="1" height="1"/><circle r="1" fill="green" style="fill: pink"/>',
      ),
    );
    expect(geo.shapes[0]!.style.fill).toBe('#f40000');
    expect(geo.shapes[1]!.style).toMatchObject({ stroke: 'blue', opacity: '.5' });
    // The style attribute wins over the sheet; the sheet, over the loose attribute.
    expect(geo.shapes[2]!.style.fill).toBe('pink');
  });
});
