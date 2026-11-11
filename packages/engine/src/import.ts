// SVG → Geometry. Shapes and paths with their transforms already applied; the rest is ignored.

import svgpath from 'svgpath';
import { line, type Cubic, type Geometry, type Gradient, type Shape, type Style, type SubPath, type Vec2 } from './geometry';
import { setSVGImporter } from './importer';

/** Style properties that are kept; the inheritable ones pass from groups to children. */
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

const CONTAINERS = new Set(['svg', 'g', 'a', 'switch', 'symbol']);

const XLINK = 'http://www.w3.org/1999/xlink';

/** Reference of a <use>: SVG 2's href or the classic xlink:href. */
const hrefOf = (el: Element) => el.getAttribute('href') ?? el.getAttributeNS(XLINK, 'href') ?? el.getAttribute('xlink:href');

/** Opacity of a style, as a number between 0 and 1. */
const opacityOf = (style: Style) => {
  const v = parseFloat(style.opacity ?? '1');
  return Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : 1;
};

const num = (el: Element, name: string, fallback = 0) => {
  const v = parseFloat(el.getAttribute(name) ?? '');
  return Number.isFinite(v) ? v : fallback;
};

/** Simple CSS rules from the SVG's <style>: by class, id or tag. */
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

/** Does a simple selector (.a, #b, path, path.a, .a.b) match the element? */
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
  // Priority order: loose attributes < style sheet < style attribute.
  const fromAttr = (names: string[]) => {
    for (const n of names) {
      const v = el.getAttribute(n);
      if (v !== null) style[n] = v.trim();
    }
  };
  fromAttr([...INHERITED, ...OWN]);
  for (const rule of sheet) if (matches(el, rule.selector)) for (const [k, v] of rule.decls) style[k] = v;
  // The style attribute wins over loose attributes and the style sheet.
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

/** Each basic shape, as SVG path data. */
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

/** Path data (with its transform applied) → cubic subpaths. */
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
            // If the last point isn't the start, the closing segment is a straight line.
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

const nattr = (el: Element, name: string): number | undefined => {
  const v = el.getAttribute(name);
  if (v === null) return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Parse gradient stops from an element. */
function readStops(el: Element): { offset: number; color: string; opacity?: number }[] {
  const stops: { offset: number; color: string; opacity?: number }[] = [];
  for (const child of Array.from(el.children)) {
    if (child.localName !== 'stop') continue;
    let off = (child.getAttribute('offset') ?? '0').trim();
    let offset = off.endsWith('%') ? parseFloat(off) / 100 : parseFloat(off);
    if (!Number.isFinite(offset)) offset = 0;
    offset = Math.max(0, Math.min(1, offset));
    // stop-color/stop-opacity can come from attributes or style.
    const style = (child.getAttribute('style') ?? '').split(';').reduce<Record<string, string>>((m, d) => {
      const i = d.indexOf(':');
      if (i >= 0) m[d.slice(0, i).trim()] = d.slice(i + 1).trim();
      return m;
    }, {});
    const color = child.getAttribute('stop-color') ?? style['stop-color'] ?? '#000';
    const sop = child.getAttribute('stop-opacity') ?? style['stop-opacity'];
    const opacity = sop != null ? parseFloat(sop) : undefined;
    stops.push({ offset, color, ...(Number.isFinite(opacity as number) ? { opacity: opacity as number } : {}) });
  }
  return stops;
}

function readGradientDef(el: Element): Omit<Gradient, 'id'> | null {
  const kind = el.localName === 'radialGradient' ? 'radial' : el.localName === 'linearGradient' ? 'linear' : null;
  if (!kind) return null;
  const href = (hrefOf(el) ?? '').replace(/^#/, '') || undefined;
  const units = el.getAttribute('gradientUnits') as Gradient['gradientUnits'] | null;
  const spread = el.getAttribute('spreadMethod') as Gradient['spreadMethod'] | null;
  const transform = el.getAttribute('gradientTransform') || undefined;
  const base: Omit<Gradient, 'id'> = {
    kind,
    stops: readStops(el),
    ...(href ? { href } : {}),
    ...(units === 'userSpaceOnUse' || units === 'objectBoundingBox' ? { gradientUnits: units } : {}),
    ...(transform ? { gradientTransform: transform } : {}),
    ...(spread === 'reflect' || spread === 'repeat' || spread === 'pad' ? { spreadMethod: spread } : {}),
  };
  if (kind === 'linear') {
    const x1 = nattr(el, 'x1'), y1 = nattr(el, 'y1'), x2 = nattr(el, 'x2'), y2 = nattr(el, 'y2');
    if (x1 !== undefined) base.x1 = x1;
    if (y1 !== undefined) base.y1 = y1;
    if (x2 !== undefined) base.x2 = x2;
    if (y2 !== undefined) base.y2 = y2;
  } else {
    const cx = nattr(el, 'cx'), cy = nattr(el, 'cy'), r = nattr(el, 'r'), fx = nattr(el, 'fx'), fy = nattr(el, 'fy'), fr = nattr(el, 'fr');
    if (cx !== undefined) base.cx = cx;
    if (cy !== undefined) base.cy = cy;
    if (r !== undefined) base.r = r;
    if (fx !== undefined) base.fx = fx;
    if (fy !== undefined) base.fy = fy;
    if (fr !== undefined) base.fr = fr;
  }
  return base;
}

/** Resolve gradient href inheritance (stops/attrs from referenced gradient when missing). */
function resolveGradients(defs: Map<string, Omit<Gradient, 'id'>>): Map<string, Gradient> {
  const out = new Map<string, Gradient>();
  const resolve = (id: string, stack: Set<string>): Gradient | null => {
    if (out.has(id)) return out.get(id)!;
    const def = defs.get(id);
    if (!def || stack.has(id)) return null;
    stack.add(id);
    let base: Gradient | null = null;
    if (def.href) base = resolve(def.href, stack);
    stack.delete(id);
    const merged: Gradient = {
      ...(base ?? {}),
      ...def,
      id,
      kind: def.kind ?? base?.kind ?? 'linear',
      stops: def.stops.length ? def.stops : (base?.stops ?? []),
    };
    // remove self-href after merge
    if (merged.href === id) delete merged.href;
    out.set(id, merged);
    return merged;
  };
  for (const id of defs.keys()) resolve(id, new Set());
  return out;
}

function collectGradients(root: Element): Map<string, Gradient> {
  const defs = new Map<string, Omit<Gradient, 'id'>>();
  for (const el of Array.from(root.getElementsByTagName('*'))) {
    if (el.localName !== 'linearGradient' && el.localName !== 'radialGradient') continue;
    const id = el.getAttribute('id');
    if (!id) continue;
    const g = readGradientDef(el);
    if (g) defs.set(id, g);
  }
  return resolveGradients(defs);
}

const urlId = (value: string | undefined): string | null => {
  if (!value) return null;
  const m = /^url\(#([^)]+)\)$/.exec(value.trim());
  return m ? m[1]! : null;
};

/** Imports an SVG (text) into geometry. */
export function parseSVG(source: string): Geometry {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.localName !== 'svg') throw new Error('svertik: el origen no es un SVG');

  sheet = parseStyleSheets(root);
  const gradients = collectGradients(root);

  // Elements that <use> may point at, by id.
  const byId = new Map<string, Element>();
  for (const el of Array.from(root.getElementsByTagName('*'))) {
    const id = el.getAttribute('id');
    if (id) byId.set(id, el);
  }

  const shapes: Shape[] = [];
  // `alpha` accumulates the opacity of groups and <use> elements above the shape (opacity doesn't inherit).
  // `active` holds the elements being expanded, so a <use> chain that points back doesn't loop forever.
  const walk = (el: Element, transform: string, inherited: Style, alpha = 1, active: Set<Element> = new Set(), referenced = false) => {
    // A whole <symbol> only draws when a <use> pulls it in.
    if (el.localName === 'symbol' && !referenced) return;
    active.add(el);
    try {
      const style = readStyle(el, inherited);
      const a = alpha * opacityOf(style);
      const t = el === root ? transform : `${transform} ${el.getAttribute('transform') ?? ''}`.trim();
      if (el.localName === 'use') {
        const href = hrefOf(el) ?? '';
        const target = href.startsWith('#') ? byId.get(href.slice(1)) : undefined;
        if (target && !active.has(target)) {
          const x = num(el, 'x');
          const y = num(el, 'y');
          const useT = x || y ? `${t} translate(${x} ${y})`.trim() : t;
          walk(target, useT, inheritable(style), a, active, true);
        }
        return;
      }
      if (CONTAINERS.has(el.localName)) {
        for (const child of Array.from(el.children)) walk(child, t, inheritable(style), a, active, referenced);
        return;
      }
      const d = shapeToPathData(el);
      if (!d) return;
      const subpaths = parsePathData(d, t);
      if (subpaths.length) {
        const sstyle = alpha === 1 ? style : { ...style, opacity: String(a) };
        const shape: Shape = { subpaths, style: sstyle };
        const refs = [urlId(sstyle.fill), urlId(sstyle.stroke)].filter((x): x is string => !!x);
        if (refs.length) {
          const used = refs.map((id) => gradients.get(id)).filter((g): g is Gradient => !!g);
          if (used.length) shape.gradients = used;
        }
        shapes.push(shape);
      }
    } finally {
      active.delete(el);
    }
  };
  walk(root, '', {});

  return { shapes, viewBox: readViewBox(root) };
}

/** Alias: el nombre que siempre ha tenido este importador en la API pública. */
export const importSVG = parseSVG;

// Al cargarse este módulo, el núcleo ya sabe leer SVG (así no lo necesita en su grafo estático).
setSVGImporter(parseSVG);
