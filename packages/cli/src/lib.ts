// svertik without a browser: read projects, draw them to SVG or PNG and describe the effects.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';
import { Window } from 'happy-dom';
import {
  builtins,
  createEngine,
  hasFont,
  isScene,
  registerFont,
  sampleScene,
  shapes,
  type SceneNode,
  type SceneV2,
  effectDescriptions,
  shapeDescriptions,
} from '@svertik/engine';

// The SVG importer uses DOMParser: in Node, happy-dom's.
const g = globalThis as unknown as { DOMParser?: unknown };
g.DOMParser ??= new Window().DOMParser;

const require = createRequire(import.meta.url);
const engine = createEngine(builtins);

/** The fonts the editor ships (JetBrains Mono regular and bold), for texts. */
export function registerBundledFonts() {
  if (hasFont('JetBrains Mono')) return;
  const load = (w: number) => {
    const b = readFileSync(require.resolve(`@fontsource/jetbrains-mono/files/jetbrains-mono-latin-${w}-normal.woff`));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  };
  registerFont('JetBrains Mono', load(400));
  registerFont('JetBrains Mono Bold', load(700));
}

/** Registers a font of your own (in case the project uses a system font): name=path. */
export function registerFontFile(spec: string) {
  const [name, path] = spec.split('=');
  if (!name || !path) throw new Error(`--font expects name=path ("${spec}")`);
  const b = readFileSync(path);
  registerFont(name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
}

export interface Loaded {
  scene: SceneV2;
  name: string;
}

/** An .svrtk, a scene's JSON or an SVG (which becomes an object without effects). */
export function loadInput(text: string, fileName: string): Loaded {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.(svrtk|json|svg)$/i, '');
  if (/<svg[\s>]/i.test(text) && !/^\s*\{/.test(text)) {
    return { scene: { version: 2, objects: [{ kind: 'object', id: 'object-1', name: `${base}.svg`, source: text, stack: [] }] }, name: base };
  }
  const data = JSON.parse(text) as { svertik?: string; name?: string; scene?: unknown };
  const scene = data.svertik === 'project' ? data.scene : data;
  if (!isScene(scene)) throw new Error(`${fileName} is neither an svertik project nor an SVG`);
  return { scene, name: data.name ?? base };
}

/** The plain SVG at time `t` (s); with `background`, a background rectangle. */
export function renderSVG(scene: SceneV2, t = 0, background?: string): string {
  const svg = engine.toSVG(sampleScene(scene, t));
  if (!background) return svg;
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(/\s+/) ?? ['0', '0', '0', '0'];
  return svg.replace(/(<svg[^>]*>)/, `$1\n  <rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="${background}"/>`);
}

/** SVG → PNG with resvg, at `scale` pixels per unit. */
export function renderPNG(svg: string, scale = 2): Buffer {
  const r = new Resvg(svg, { fitTo: { mode: 'zoom', value: scale }, font: { loadSystemFonts: false } });
  return r.render().asPng();
}

/** The animation's frames: times from 0 to the duration, at `fps`. */
export function frameTimes(scene: SceneV2, fps?: number): number[] {
  const anim = scene.animation;
  if (!anim) return [0];
  const f = fps ?? anim.fps ?? 30;
  const n = Math.max(1, Math.round(anim.duration * f));
  return Array.from({ length: n }, (_, i) => i / f);
}

/** The effects and primitives, with their parameters: what an agent needs to write scenes. */
export function describeEffects() {
  const spec = (params: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(params).map(([k, v]) => {
        const s = v as Record<string, unknown>;
        const out: Record<string, unknown> = { type: s.type, default: s.default };
        for (const key of ['min', 'max', 'options', 'unit', 'group', 'label']) if (s[key] !== undefined) out[key] = s[key];
        return [k, out];
      }),
    );
  return {
    effects: builtins.map((m) => ({ type: m.type, label: m.label, kind: m.kind, description: effectDescriptions[m.type], params: spec(m.params) })),
    shapes: shapes.map((s) => ({ type: s.type, label: s.label, description: shapeDescriptions[s.type], params: spec(s.params) })),
  };
}

/** Summary of a project: objects, their effects and the animation. */
export function describeScene(scene: SceneV2): string {
  const lines: string[] = [];
  const walk = (nodes: SceneNode[], depth: number) => {
    for (const node of nodes) {
      const what = node.kind === 'shape' ? node.shape : node.kind;
      const stack = node.stack.map((m) => m.type + (m.children?.length ? `(${m.children.map((c) => c.type).join(', ')})` : '')).join(' → ');
      lines.push(`${'  '.repeat(depth)}${node.name} [${what}]${stack ? `: ${stack}` : ''}`);
      if (node.kind === 'group') walk(node.children, depth + 1);
    }
  };
  walk(scene.objects, 0);
  const a = scene.animation;
  if (a?.tracks.length) lines.push(`animation: ${a.duration} s${a.loop === false ? '' : ', looping'}, ${a.tracks.length} tracks (${a.tracks.map((t) => t.param).join(', ')})`);
  return lines.join('\n');
}
