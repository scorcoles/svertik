// svertik without a browser: read projects, draw them to SVG or PNG and describe the effects.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';
import { Window } from 'happy-dom';
import {
  attachSources,
  builtins,
  createEngine,
  effectDescriptions,
  fontKey,
  hasFont,
  initKernels,
  isScene,
  missingSources,
  registerFont,
  sampleScene,
  sceneTrailWindow,
  shapeDescriptions,
  shapes,
  type SceneNode,
  type SceneV1,
} from '@svertik/engine';

// The SVG importer uses DOMParser: in Node, happy-dom's.
const g = globalThis as unknown as { DOMParser?: unknown };
g.DOMParser ??= new Window().DOMParser;

const require = createRequire(import.meta.url);
const engine = createEngine(builtins);
// The heavy kernels (WebAssembly), when they are there: the scenes with Metaball go several times
// faster. If they cannot be read, the engine uses its versions in TypeScript (same drawing).
await initKernels();

/** The bundled text fonts: Commit Mono regular and bold. */
export async function registerBundledFonts() {
  for (const weight of [400, 700]) {
    const key = fontKey('Commit Mono', weight);
    if (hasFont(key)) continue;
    const b = readFileSync(require.resolve(`@fontsource/commit-mono/files/commit-mono-latin-${weight}-normal.woff`));
    await registerFont(key, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  }
}

/** Registers a font of your own (in case the project uses a system font): name=path. */
export async function registerFontFile(spec: string) {
  const [name, path] = spec.split('=');
  if (!name || !path) throw new Error(`--font expects name=path ("${spec}")`);
  const b = readFileSync(path);
  await registerFont(name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
}

export interface Loaded {
  scene: SceneV1;
  name: string;
}

/**
 * A project's JSON (or a bare scene's) or an SVG (which becomes an object without effects). SVGs the project
 * keeps outside (`href`) are read next to the file.
 */
export function loadInput(text: string, fileName: string): Loaded {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.(json|svg)$/i, '');
  if (/<svg[\s>]/i.test(text) && !/^\s*\{/.test(text)) {
    return { scene: { version: 1, objects: [{ kind: 'object', id: 'object-1', name: `${base}.svg`, source: text, stack: [] }] }, name: base };
  }
  const data = JSON.parse(text) as { svertik?: string; name?: string; scene?: unknown };
  const scene = data.svertik === 'project' ? data.scene : data;
  if (!isScene(scene)) throw new Error(`${fileName} is neither an svertik project nor an SVG`);
  const missing = missingSources(scene);
  if (!missing.length) return { scene, name: data.name ?? base };
  const files = new Map<string, string>();
  for (const href of missing) {
    const path = resolve(dirname(fileName), href);
    if (!existsSync(path)) throw new Error(`${fileName} uses ${href}, which is not next to it (${path})`);
    files.set(href, readFileSync(path, 'utf8'));
  }
  return { scene: attachSources(scene, files), name: data.name ?? base };
}

/**
 * The engine traces a trail with what it has already seen, so for a still frame the scene has to
 * have been played a little before (otherwise the trail would be empty). The scenes already
 * prepared are remembered, so a sequence of frames is not replayed from the start each time.
 */
const prepared = new WeakSet<SceneV1>();

/** Plays the stretch before `t` so that the trails of the scene are complete. */
function prepareTrail(scene: SceneV1, t: number): void {
  if (prepared.has(scene)) return;
  prepared.add(scene);
  const window = sceneTrailWindow(scene);
  if (!window || t <= 0) return;
  const fps = scene.animation?.fps ?? 30;
  const step = 1 / fps;
  for (let s = Math.max(0, t - window); s < t - 1e-9; s += step) engine.toSVG(sampleScene(scene, s));
}

/** The plain SVG at time `t` (s); with `background`, a background rectangle. */
export function renderSVG(scene: SceneV1, t = 0, background?: string): string {
  prepareTrail(scene, t);
  const svg = engine.toSVG(sampleScene(scene, t));
  if (!background) return svg;
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(/\s+/) ?? ['0', '0', '0', '0'];
  return svg.replace(/(<svg[^>]*>)/, `$1\n  <rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="${background}"/>`);
}

/**
 * resvg aborts the whole process (a Rust panic Node cannot catch) on a path with `opacity` lying entirely
 * outside the canvas, e.g. a body still falling far above the page. Such a path is invisible in the PNG,
 * so it is dropped. Its box is taken from all its coordinates (control points included), a superset.
 */
function withoutOffCanvasOpacity(svg: string): string {
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(/[\s,]+/).map(Number);
  if (!vb || vb.length !== 4 || vb.some((n) => !Number.isFinite(n))) return svg;
  const [x0, y0, w, h] = vb as [number, number, number, number];
  return svg.replace(/<path\b[^>]*\bopacity="[^"]*"[^>]*\/>/g, (tag) => {
    const d = / d="([^"]*)"/.exec(tag)?.[1];
    if (!d || /\btransform=/.test(tag)) return tag;
    const nums = d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi)?.map(Number) ?? [];
    if (nums.length < 2 || /[aAhHvV]/.test(d)) return tag;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i + 1 < nums.length; i += 2) { minX = Math.min(minX, nums[i]!); maxX = Math.max(maxX, nums[i]!); minY = Math.min(minY, nums[i + 1]!); maxY = Math.max(maxY, nums[i + 1]!); }
    const outside = maxX < x0 || minX > x0 + w || maxY < y0 || minY > y0 + h;
    return outside ? '' : tag;
  });
}

/** SVG → PNG with resvg, at `scale` pixels per unit. */
export function renderPNG(svg: string, scale = 2): Buffer {
  const r = new Resvg(withoutOffCanvasOpacity(svg), { fitTo: { mode: 'zoom', value: scale }, font: { loadSystemFonts: false } });
  return r.render().asPng();
}

/** The animation's frames: times from 0 to the duration, at `fps`. */
export function frameTimes(scene: SceneV1, fps?: number): number[] {
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
export function describeScene(scene: SceneV1): string {
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
