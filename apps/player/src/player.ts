// svertik for the web: plays a scene in any page.
//
//   <svg id="logo"></svg>
//   <script type="module">
//     import { play } from './svertik.js';
//     await play(scene, '#logo');
//   </script>
//
// Or without writing any code: mark the <svg> and it is found and played.
//
//   <svg id="logo" data-svertik="scene.json"></svg>
//
// The bundle carries the engine and nothing else: a scene's effects are loaded when it needs them (each
// one is a chunk of its own), and the fonts and the SVG importer only if the scene uses them.

import { createEngine, createPlayer, installWire, isScene, prepareScene, registerFont, resolveSources, type Renderer, type SceneV1, type WireOptions } from '@svertik/engine/player';

export interface PlayOptions {
  /** How long each computed frame took (to measure). */
  onFrame?: (info: { ms: number; t: number }) => void;
  /**
   * Wire view (outlines only, a colour per kind of object): `true` toggles it with the W key; or give
   * the key and whether to start in Wire. Off by default, so an embedded scene does not take keys.
   */
  wire?: boolean | WireOptions;
  /**
   * Who paints: `auto` (default here: a canvas for frames with many shapes, SVG otherwise), `svg` or
   * `canvas` (frames with filters or masks always go to SVG).
   */
  renderer?: Renderer;
}

export interface Playing {
  /** The scene, as it is playing. */
  scene: SceneV1;
  /** The <svg> it draws into. */
  svg: SVGSVGElement;
  /** Paints again (if the scene changed). */
  refresh(): void;
  /** Stops the animation and removes its listeners. */
  stop(): void;
}

/** Where to draw: a selector, an <svg>, or a container (an <svg> is made inside it). */
function resolveSVG(target: string | Element): SVGSVGElement {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) throw new Error(`svertik: "${String(target)}" not found`);
  if (el instanceof SVGSVGElement) return el;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.appendChild(svg);
  return svg;
}

/** Reads the SVGs a scene keeps outside (`href`), relative to `base` (the JSON's URL). */
export function withSources(scene: SceneV1, base: string = document.baseURI): Promise<SceneV1> {
  return resolveSources(scene, async (href) => {
    const url = new URL(href, new URL(base, document.baseURI)).href;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`svertik: can't read the SVG "${url}" (${res.status})`);
    return res.text();
  });
}

/** Loads a scene from a JSON file (a project or a bare scene), with the SVGs it keeps apart. */
export async function loadScene(url: string): Promise<SceneV1> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`svertik: can't read "${url}" (${res.status})`);
  const data = (await res.json()) as { svertik?: string; scene?: unknown; canvas?: string };
  const scene = (data.svertik === 'project' ? data.scene : data) as SceneV1;
  if (!isScene(scene)) throw new Error(`svertik: "${url}" is not a scene`);
  // Projects from before scene.background kept it as the editor's canvas colour.
  if (data.svertik === 'project' && data.canvas && !scene.background) scene.background = data.canvas;
  return withSources(scene, url);
}

/**
 * Prepares the scene (downloads only its effects and, if needed, its fonts) and plays it.
 * Returns the player, to stop it or paint again.
 */
export async function play(scene: SceneV1, target: string | Element, options: PlayOptions = {}): Promise<Playing> {
  if (!isScene(scene)) throw new Error('svertik: not a valid scene');
  const svg = resolveSVG(target);
  const effects = await prepareScene(scene);
  const engine = createEngine(effects);
  const { wire: _wire, ...playerOptions } = options;
  const player = createPlayer(engine, svg, scene, { renderer: 'auto', ...playerOptions });
  const wire = options.wire ? installWire(svg, scene, options.wire === true ? {} : options.wire) : null;
  return { scene, svg, refresh: player.refresh, stop() { wire?.dispose(); player.stop(); } };
}

/**
 * Plays every marked scene: `<svg data-svertik="scene.json">` (a JSON file) or
 * `<svg data-svertik-scene='{"version":1,…}'>` (the scene inline).
 */
export async function mountAll(root: ParentNode = document): Promise<Playing[]> {
  const out: Playing[] = [];
  const els = Array.from(root.querySelectorAll('[data-svertik], [data-svertik-scene]'));
  for (const el of els) {
    const inline = el.getAttribute('data-svertik-scene');
    const url = el.getAttribute('data-svertik');
    try {
      const scene = inline ? await withSources(JSON.parse(inline) as SceneV1) : await loadScene(url!);
      out.push(await play(scene, el as Element));
    } catch (err) {
      console.error('svertik: could not play the scene', err);
    }
  }
  return out;
}

// When the module loads, the marked scenes play by themselves.
if (typeof document !== 'undefined') {
  const start = () => void mountAll();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

export { createEngine, createPlayer, prepareScene, isScene, registerFont };
export type { SceneV1 };
