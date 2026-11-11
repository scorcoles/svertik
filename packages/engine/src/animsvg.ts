// SVG animado: un solo archivo .svg que se anima solo (CSS dentro del propio SVG), sin JavaScript.
// Parte del mismo análisis que Lottie (motion.ts): lo que solo se mueve, gira, escala o se desvanece va con
// animaciones de `transform` y `opacity` (suaves; el navegador las acelera); lo que cambia de forma, por
// tramos que se encienden y se apagan. Los filtros sí van (son SVG); las interacciones, no.

import type { SceneV2 } from './document';
import type { Engine } from './engine';
import type { Geometry, Shape } from './geometry';
import type { Mat } from './matrix';
import { analyzeMotion, type MotionLayer } from './motion';
import { filterDefs, gradientDefs, styleAttrs, toPathData, wrapAttr } from './render';

export interface AnimatedSVGExport {
  svg: string;
  /** Lo que no se ha exportado o lo que conviene saber (en inglés: lo enseña el editor). */
  warnings: string[];
  frames: number;
}

const n2 = (v: number) => String(Math.round(v * 100) / 100);
const n4 = (v: number) => String(Math.round(v * 10000) / 10000);
const matrixCSS = (m: Mat) => `matrix(${n4(m[0])},${n4(m[1])},${n4(m[2])},${n4(m[3])},${n2(m[4])},${n2(m[5])})`;

export function toAnimatedSVG(engine: Engine, scene: SceneV2): AnimatedSVGExport {
  const a = analyzeMotion(engine, scene);
  const { frames, fps } = a;
  const duration = frames / fps;
  const pct = (f: number) => `${Math.round((f / frames) * 100000) / 1000}%`;
  const css: string[] = [];
  let count = 0;

  /**
   * Una animación de transform y opacidad, fotograma a fotograma desde `from`; solo las claves donde el
   * movimiento deja de ser recto. null si no cambia nada (entonces va como atributo, sin animación).
   */
  function motion(ms: Mat[], opacity: number[], from: number): string | null {
    const vals = ms.map((m, i) => [...m, opacity[i] ?? 1]);
    const still = vals.every((v) => v.every((x, k) => Math.abs(x - vals[0]![k]!) < 1e-4));
    if (still) return null;
    const keep = vals.map((v, i) => {
      if (i === 0 || i === vals.length - 1) return true;
      const p = vals[i - 1]!, q = vals[i + 1]!;
      return v.some((x, k) => Math.abs(x - (p[k]! + q[k]!) / 2) > 1e-3);
    });
    const name = `m${++count}`;
    const steps = vals.flatMap((v, i) => (keep[i] ? [`${pct(from + i)}{transform:${matrixCSS(v.slice(0, 6) as Mat)};opacity:${n4(v[6]!)}}`] : []));
    // Antes y después del tramo, quieto en su primer y su último valor.
    const first = vals[0]!, last = vals[vals.length - 1]!;
    if (from > 0) steps.unshift(`0%{transform:${matrixCSS(first.slice(0, 6) as Mat)};opacity:${n4(first[6]!)}}`);
    steps.push(`100%{transform:${matrixCSS(last.slice(0, 6) as Mat)};opacity:${n4(last[6]!)}}`);
    css.push(`@keyframes ${name}{${steps.join('')}}`);
    return name;
  }
  /** Que solo se vea en su tramo de fotogramas [ip, op). null si se ve siempre. */
  function span(ip: number, op: number): string | null {
    if (ip <= 0 && op >= frames) return null;
    const name = `v${++count}`;
    const steps = [`0%{visibility:${ip <= 0 ? 'visible' : 'hidden'}}`];
    if (ip > 0) steps.push(`${pct(ip)}{visibility:visible}`);
    if (op < frames) steps.push(`${pct(op)}{visibility:hidden}`);
    css.push(`@keyframes ${name}{${steps.join('')}}`);
    return name;
  }
  const path = (s: Shape) => `<path d="${toPathData(s, 2)}"${styleAttrs(s.style)}/>`;
  const anim = (name: string | null, cls: string) => (name ? ` class="${cls}" style="animation-name:${name}"` : '');
  // Sin animación: la colocación y la opacidad, como atributos.
  const attr = (m: Mat, o: number) => ` transform="${matrixCSS(m)}"${o < 1 ? ` opacity="${n4(o)}"` : ''}`;

  function layerSVG(l: MotionLayer): string {
    const vis = span(l.ip, l.op);
    let body: string;
    if (l.kind === 'object') {
      const name = motion(l.matrices, l.opacity, 0);
      body = `<g${name ? anim(name, 'm') : attr(l.matrices[0]!, l.opacity[0] ?? 1)}>${l.shapes.map(path).join('')}</g>`;
    } else if (l.kind === 'pieces') {
      body = l.shapes
        .map((s, i) => {
          const p = l.pieces[i]!;
          const name = motion(p.matrices, p.opacity, l.ip);
          return `<g${name ? anim(name, 'm') : attr(p.matrices[0]!, p.opacity[0] ?? 1)}>${path(s)}</g>`;
        })
        .join('');
    } else body = l.shapes.map(path).join('');
    return vis ? `<g${anim(vis, 'v')}>${body}</g>` : l.kind === 'frame' && l.shapes.length > 1 ? `<g>${body}</g>` : body;
  }

  // Las capas, de atrás adelante; las de un objeto con filtros, dentro de su <g filter> (anidados).
  const lines: string[] = [];
  let open: string[] = [];
  for (const l of a.layers) {
    const wrap = l.wrap ?? [];
    let same = 0;
    while (same < open.length && same < wrap.length && open[same] === wrap[same]) same++;
    for (let i = open.length - 1; i >= same; i--) lines.push('</g>');
    for (let i = same; i < wrap.length; i++) {
      const [k, v] = wrapAttr({ viewBox: a.viewBox, shapes: [], filters: a.filters }, wrap[i]!);
      lines.push(`<g ${k}="${v}">`);
    }
    open = wrap;
    lines.push(layerSVG(l));
  }
  for (let i = open.length - 1; i >= 0; i--) lines.push('</g>');

  const all: Geometry = { viewBox: a.viewBox, shapes: a.layers.flatMap((l) => l.shapes), filters: a.filters };
  const defs = gradientDefs(all) + filterDefs(all);
  const loop = a.loop ? 'infinite' : '1';
  const style =
    css.length === 0
      ? ''
      : `<style>` +
        // Transformaciones en el sistema del viewBox (desde su origen), como el resto del SVG.
        `.m,.v{animation-duration:${n4(duration)}s;animation-iteration-count:${loop};animation-fill-mode:both}` +
        `.m{transform-box:view-box;transform-origin:0 0;animation-timing-function:linear}` +
        `.v{animation-timing-function:step-end}` +
        css.join('') +
        // Con «reducir movimiento», quieto.
        `@media (prefers-reduced-motion:reduce){.m,.v{animation-play-state:paused}}` +
        `</style>`;
  const [x, y, w, h] = a.viewBox;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}">${style}${defs ? `<defs>${defs}</defs>` : ''}\n${lines.join('\n')}\n</svg>\n`;

  const warnings: string[] = [];
  if (scene.interactions?.length) warnings.push('Interactions (hover, click, enter) are not exported: the animated SVG plays on its own. For them, use the exported code.');
  if (a.filtersChange) warnings.push('Filters that change during the animation (animated values, or an Area on a moving object) keep their first frame.');
  if (a.heavy.length) warnings.push(`Partly exported frame by frame (their shape changes, so the file is heavier): ${a.heavy.join(', ')}.`);
  if (!a.autoplay) warnings.push('Autoplay is off here, but the animated SVG always plays on its own.');
  return { svg, warnings, frames };
}
