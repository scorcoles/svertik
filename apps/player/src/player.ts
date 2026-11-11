// El reproductor de svertik, para incrustar en una web.
//
//   <svg id="logo"></svg>
//   <script type="module" src="svertik-player.js"></script>
//   <script type="module">
//     import { play } from './svertik-player.js';
//     await play(escena, '#logo');
//   </script>
//
// O sin escribir nada: se marca el <svg> y el reproductor lo encuentra solo.
//
//   <svg id="logo" data-svertik="escena.json"></svg>
//
// El bundle lleva el motor y nada más: los efectos de la escena se cargan cuando llegan (cada uno es
// un trozo aparte), y las fuentes y el importador de SVG solo si la escena los necesita.

import { createEngine, createPlayer, isScene, prepareScene, type SceneV2 } from '@svertik/engine/player';

export interface PlayOptions {
  /** Cuánto tardó cada fotograma calculado (para medir). */
  onFrame?: (info: { ms: number; t: number }) => void;
}

export interface Playing {
  /** La escena, tal y como se está reproduciendo. */
  scene: SceneV2;
  /** El <svg> donde se dibuja. */
  svg: SVGSVGElement;
  /** Vuelve a pintar (si la escena ha cambiado). */
  refresh(): void;
  /** Para la animación y quita los escuchadores. */
  stop(): void;
}

/** El <svg> donde dibujar: un selector, un elemento, o un contenedor (dentro se crea un <svg>). */
function resolveSVG(target: string | Element): SVGSVGElement {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) throw new Error(`svertik: no se encuentra «${String(target)}»`);
  if (el instanceof SVGSVGElement) return el;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.appendChild(svg);
  return svg;
}

/** Carga una escena de un JSON (un .svrtk o el JSON de la escena). */
export async function loadScene(url: string): Promise<SceneV2> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`svertik: no se puede leer «${url}» (${res.status})`);
  const data = (await res.json()) as { svertik?: string; scene?: unknown };
  const scene = (data.svertik === 'project' ? data.scene : data) as SceneV2;
  if (!isScene(scene)) throw new Error(`svertik: «${url}» no es una escena`);
  return scene;
}

/**
 * Prepara la escena (baja solo sus efectos y, si hace falta, sus fuentes) y la dibuja.
 * Devuelve el reproductor, para poder pararlo o volver a pintar.
 */
export async function play(scene: SceneV2, target: string | Element, options: PlayOptions = {}): Promise<Playing> {
  if (!isScene(scene)) throw new Error('svertik: la escena no es válida');
  const svg = resolveSVG(target);
  const effects = await prepareScene(scene);
  const engine = createEngine(effects);
  const player = createPlayer(engine, svg, scene, options);
  return { scene, svg, refresh: player.refresh, stop: player.stop };
}

/**
 * Reproduce todas las escenas marcadas: `<svg data-svertik="escena.json">` (un JSON) o
 * `<svg data-svertik-scene='{"version":2,…}'>` (la escena en el sitio).
 */
export async function mountAll(root: ParentNode = document): Promise<Playing[]> {
  const out: Playing[] = [];
  const els = Array.from(root.querySelectorAll('[data-svertik], [data-svertik-scene]'));
  for (const el of els) {
    const inline = el.getAttribute('data-svertik-scene');
    const url = el.getAttribute('data-svertik');
    try {
      const scene = inline ? (JSON.parse(inline) as SceneV2) : await loadScene(url!);
      out.push(await play(scene, el as Element));
    } catch (err) {
      console.error('svertik: no se pudo reproducir la escena', err);
    }
  }
  return out;
}

// Al cargar el módulo, las escenas marcadas se reproducen solas.
if (typeof document !== 'undefined') {
  const start = () => void mountAll();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

export { createEngine, createPlayer, prepareScene, isScene };
export type { SceneV2 };
