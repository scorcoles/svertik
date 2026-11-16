// La página Play (play.html#p=…): la escena de un enlace compartido, a pantalla completa, con el
// mismo reproductor que el código exportado. Solo carga el motor: sin el editor ni su interfaz.
// Y solo lo que la escena usa: sus efectos se cargan al vuelo (ver «prepareScene»).
import { runStages, type BootStage } from './stages';
import { createFpsMeter } from './fpsmeter';
import { downloadFrame } from './capture';
import { decodeState } from './share';

/**
 * Fases del modo Play: el motor (runtime) y, con la escena, sus efectos (cada uno, su trozo).
 * Sin UI: el loader de play.html#p=… las carga y luego arranca el player.
 */
const PLAY_STAGES: BootStage[] = [
  { id: 'engine', label: 'Loading Engine', run: async () => { await import('@svertik/engine/player'); } },
];

const stage = document.getElementById('stage') as unknown as SVGSVGElement;
const msg = document.getElementById('msg')!;
const tools = document.getElementById('tools')!;
const capture = document.getElementById('capture') as HTMLButtonElement;
const video = document.getElementById('video') as HTMLButtonElement;
let sceneName = 'svertik';
capture.addEventListener('click', async () => {
  if (capture.disabled) return;
  capture.disabled = true;
  try {
    await downloadFrame(stage, getComputedStyle(document.body).backgroundColor, sceneName);
    say('Frame downloaded');
  } catch {
    say('Could not download the frame.');
  } finally {
    capture.disabled = false;
  }
});
let timer: ReturnType<typeof setTimeout> | undefined;
let toolsTimer: ReturnType<typeof setTimeout> | undefined;
addEventListener('pointermove', () => {
  tools.dataset.active = 'true';
  clearTimeout(toolsTimer);
  toolsTimer = setTimeout(() => delete tools.dataset.active, 1500);
}, { passive: true });
const say = (text: string, ms = 2400) => {
  msg.textContent = text;
  msg.hidden = false;
  clearTimeout(timer);
  if (ms) timer = setTimeout(() => (msg.hidden = true), ms);
};

async function start(m: typeof import('@svertik/engine/player')) {
  const { createEngine, createPlayer, prepareScene, effectTypes, sceneEffectTypes, evaluateSceneVariables } = m;
  const hash = location.hash.match(/^#[ps]=(.+)$/);
  if (!hash) return say('No scene in this link.', 0);
  const state = await decodeState(hash[1]!);
  if (!state) return say('No scene in this link.', 0);
  const scene = state.scene;
  stage.classList.toggle('full-viewport', !!m.viewportFit(scene));
  sceneName = state.name;
  document.title = `${state.name} · svertik`;
  if (state.canvas) document.body.style.background = state.canvas;
  // Los efectos que la escena pide (y solo ellos). Los que no existen se avisan por consola.
  const unknown = sceneEffectTypes(scene).filter((t) => !effectTypes.includes(t));
  if (unknown.length) console.warn(`svertik: effects that don't exist: ${unknown.join(', ')}`);
  // Las fuentes de sus textos, de Fontsource (solo si hay textos), y el importador si trae SVG suelto.
  const effects = await prepareScene(scene);
  // Rendimiento: D o ?debug en la URL.
  const meter = createFpsMeter(document.body, new URLSearchParams(location.search).has('debug'));
  addEventListener('keydown', (e) => e.key.toLowerCase() === 'd' && !e.metaKey && !e.ctrlKey && meter.toggle());
  // Wire (W, or ?wire in the URL): outlines only, as in the editor's canvas.
  m.installWire(stage, scene, { initial: new URLSearchParams(location.search).has('wire'), onChange: (on) => document.body.classList.toggle('wire', on) });
  createPlayer(createEngine(effects), stage, scene, { onFrame: ({ ms, t }) => {
    meter.frame(ms);
    const values = evaluateSceneVariables(scene, t);
    meter.variables({ cycle: values.cycle, time: values.time, frame: values.frame, fps: values.fps, duration: values.duration, progress: values.progress, seedGenerator: values.seedGenerator }, values.custom);
  } });
  capture.disabled = false;
  video.disabled = false;
  let exportController: AbortController | null = null;
  const videoIcon = [...video.childNodes];
  video.addEventListener('click', async () => {
    if (exportController) { exportController.abort(); return; }
    const controller = exportController = new AbortController();
    // Freeze the mobile screen framing before loading the encoder or changing orientation.
    const rect = stage.getBoundingClientRect();
    const viewport = matchMedia('(pointer: coarse)').matches ? {
      width: window.innerWidth, height: window.innerHeight, pixelRatio: window.devicePixelRatio || 1,
      scene: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    } : undefined;
    video.textContent = 'Cancel';
    video.setAttribute('aria-label', 'Cancel MP4 export');
    video.title = 'Cancel MP4 export';
    say('Preparing MP4…', 0);
    try {
      // Keep the encoder out of the normal playback download.
      const { downloadMP4 } = await import('./video');
      await downloadMP4(createEngine(effects), scene, {
        background: getComputedStyle(document.body).backgroundColor,
        name: sceneName,
        viewport,
        signal: controller.signal,
        onProgress: progress => say(`Exporting MP4… ${Math.round(progress * 100)}%`, 0),
      });
      say('MP4 downloaded');
    } catch (error) {
      say(controller.signal.aborted ? 'MP4 export cancelled' : error instanceof Error ? error.message : 'Could not export MP4.');
    } finally {
      exportController = null;
      video.replaceChildren(...videoIcon);
      video.setAttribute('aria-label', 'Export one cycle as MP4');
      video.title = 'Export one cycle as MP4';
    }
  });
}

void runStages(PLAY_STAGES, async () => {
  const m = await import('@svertik/engine/player');
  start(m);
});
