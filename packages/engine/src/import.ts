// SVG → Geometry. Formas y trazados con sus transformaciones ya aplicadas; el resto se ignora.

import svgpath from 'svgpath';
import { line, type Cubic, type Geometry, type Shape, type Style, type SubPath, type Vec2 } from './geometry';

/** Propiedades de estilo que se conservan; las heredables pasan de los grupos a los hijos. */
const INHERITED = [
  'fill',
  'fill-rule',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
];
const OWN = ['opacity'];

const CONTAINERS = new Set(['svg', 'g', 'a', 'switch']);

const num = (el: Element, name: string, fallback = 0) => {
  const v = parseFloat(el.getAttribute(name) ?? '');
  return Number.isFinite(v) ? v : fallback;
};

/** Reglas CSS sencillas de los <style> del SVG: por clase, id o etiqueta (como exporta Illustrator). */
type Rule = { selector: string; decls: [string, string][] };

function parseStyleSheets(root: Element): Rule[] {
  const rules: Rule[] = [];
  for (const el of Array.from(root.getElementsByTagName('style'))) {
    const css = (el.textContent ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const decls = m[2]!
        .split(';')
        .map((d) => d.split(':').map((x) => x.trim()) as [string, string])
        .filter(([k, v]) => k && v && (INHERITED.includes(k) || OWN.includes(k)));
      for (const selector of m[1]!.split(',').map((s) => s.trim()).filter(Boolean)) rules.push({ selector, decls });
    }
  }
  return rules;
}

/** ¿Encaja un selector simple (.a, #b, path, path.a, .a.b) con el elemento? */
function matches(el: Element, selector: string): boolean {
  const m = /^([a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)$/.exec(selector);
  if (!m) return false;
  if (m[1] && el.localName !== m[1]) return false;
  const classes = (el.getAttribute('class') ?? '').split(/\s+/);
  for (const part of m[2]!.match(/[.#][\w-]+/g) ?? []) {
    if (part[0] === '.' && !classes.includes(part.slice(1))) return false;
    if (part[0] === '#' && el.getAttribute('id') !== part.slice(1)) return false;
  }
  return true;
}

let sheet: Rule[] = [];

function readStyle(el: Element, inherited: Style): Style {
  const style: Style = { ...inherited };
  // Orden de prioridad: atributos sueltos < hoja de estilo < atributo style.
  const fromAttr = (names: string[]) => {
    for (const n of names) {
      const v = el.getAttribute(n);
      if (v !== null) style[n] = v.trim();
    }
  };
  fromAttr([...INHERITED, ...OWN]);
  for (const rule of sheet) if (matches(el, rule.selector)) for (const [k, v] of rule.decls) style[k] = v;
  // El atributo style manda sobre los atributos sueltos y la hoja de estilo.
  for (const decl of (el.getAttribute('style') ?? '').split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const name = decl.slice(0, i).trim();
    if (INHERITED.includes(name) || OWN.includes(name)) style[name] = decl.slice(i + 1).trim();
  }
  return style;
}

function inheritable(style: Style): Style {
  const out: Style = {};
  for (const n of INHERITED) if (style[n] !== undefined) out[n] = style[n];
  return out;
}

const pointsAttr = (el: Element) => {
  const n = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
  const pts: string[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) pts.push(`${n[i]} ${n[i + 1]}`);
  return pts;
};

/** Cada forma básica, como datos de trazado SVG. */
function shapeToPathData(el: Element): string | null {
  switch (el.localName) {
    case 'path':
      return el.getAttribute('d');
    case 'rect': {
      const x = num(el, 'x');
      const y = num(el, 'y');
      const w = num(el, 'width');
      const h = num(el, 'height');
      if (w <= 0 || h <= 0) return null;
      let rx = el.hasAttribute('rx') ? num(el, 'rx') : num(el, 'ry');
      let ry = el.hasAttribute('ry') ? num(el, 'ry') : rx;
      rx = Math.min(Math.max(rx, 0), w / 2);
      ry = Math.min(Math.max(ry, 0), h / 2);
      if (rx === 0 || ry === 0) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      const a = (dx: number, dy: number) => `A${rx} ${ry} 0 0 1 ${dx} ${dy}`;
      return (
        `M${x + rx} ${y}H${x + w - rx}${a(x + w, y + ry)}V${y + h - ry}${a(x + w - rx, y + h)}` +
        `H${x + rx}${a(x, y + h - ry)}V${y + ry}${a(x + rx, y)}Z`
      );
    }
    case 'circle':
    case 'ellipse': {
      const cx = num(el, 'cx');
      const cy = num(el, 'cy');
      const rx = el.localName === 'circle' ? num(el, 'r') : num(el, 'rx');
      const ry = el.localName === 'circle' ? rx : num(el, 'ry');
      if (rx <= 0 || ry <= 0) return null;
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    case 'line':
      return `M${num(el, 'x1')} ${num(el, 'y1')}L${num(el, 'x2')} ${num(el, 'y2')}`;
    case 'polyline':
    case 'polygon': {
      const pts = pointsAttr(el);
      if (pts.length < 2) return null;
      return `M${pts.join('L')}${el.localName === 'polygon' ? 'Z' : ''}`;
    }
    default:
      return null;
  }
}

/** Datos de trazado (ya con su transformación) → subtrazados de cúbicas. */
export function parsePathData(d: string, transform = ''): SubPath[] {
  const subpaths: SubPath[] = [];
  let current: SubPath | null = null;
  let start: Vec2 = [0, 0];

  const push = (seg: Cubic) => {
    if (!current) {
      current = { start, segs: [], closed: false };
      subpaths.push(current);
    }
    current.segs.push(seg);
  };

  svgpath(d)
    .transform(transform)
    .abs()
    .unarc()
    .unshort()
    .iterate((s, _i, x, y) => {
      const from: Vec2 = [x, y];
      switch (s[0]) {
        case 'M':
          start = [s[1], s[2]];
          current = { start, segs: [], closed: false };
          subpaths.push(current);
          break;
        case 'L':
          push(line(from, [s[1], s[2]]));
          break;
        case 'H':
          push(line(from, [s[1], y]));
          break;
        case 'V':
          push(line(from, [x, s[1]]));
          break;
        case 'C':
          push({ c1: [s[1], s[2]], c2: [s[3], s[4]], p: [s[5], s[6]] });
          break;
        case 'Q': {
          const q: Vec2 = [s[1], s[2]];
          const p: Vec2 = [s[3], s[4]];
          push({
            c1: [from[0] + (2 / 3) * (q[0] - from[0]), from[1] + (2 / 3) * (q[1] - from[1])],
            c2: [p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])],
            p,
          });
          break;
        }
        case 'Z':
        case 'z': {
          const sp = current as SubPath | null;
          if (sp) {
            // Si el último punto no es el inicio, el cierre es una recta.
            const last = sp.segs.length ? sp.segs[sp.segs.length - 1]!.p : sp.start;
            if (last[0] !== sp.start[0] || last[1] !== sp.start[1]) sp.segs.push(line(last, sp.start));
            sp.closed = true;
          }
          current = null;
          break;
        }
      }
    });

  return subpaths.filter((sp) => sp.segs.length > 0);
}

function readViewBox(svg: Element): [number, number, number, number] {
  const vb = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb.every(Number.isFinite)) return vb as [number, number, number, number];
  return [0, 0, num(svg, 'width', 100), num(svg, 'height', 100)];
}

/** Importa un SVG (texto) a geometría. */
export function importSVG(source: string): Geometry {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.localName !== 'svg') throw new Error('svertik: el origen no es un SVG');

  sheet = parseStyleSheets(root);
  const shapes: Shape[] = [];
  const walk = (el: Element, transform: string, inherited: Style) => {
    const style = readStyle(el, inherited);
    const t = el === root ? transform : `${transform} ${el.getAttribute('transform') ?? ''}`.trim();
    if (CONTAINERS.has(el.localName)) {
      for (const child of Array.from(el.children)) walk(child, t, inheritable(style));
      return;
    }
    const d = shapeToPathData(el);
    if (!d) return;
    const subpaths = parsePathData(d, t);
    if (subpaths.length) shapes.push({ subpaths, style });
  };
  walk(root, '', {});

  return { shapes, viewBox: readViewBox(root) };
}
