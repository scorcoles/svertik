// La página Play (play.html#p=…): la escena de un enlace compartido, a pantalla completa, con el
// mismo reproductor que el código exportado. Solo carga el motor: sin el editor ni su interfaz.
// Y solo lo que la escena usa: sus efectos se cargan al vuelo (ver «prepareScene»).
import { runStages, type BootStage } from './stages';
import { createFpsMeter } from './fpsmeter';
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
const edit = document.getElementById('edit') as HTMLAnchorElement;
let timer: ReturnType<typeof setTimeout> | undefined;
const say = (text: string, ms = 2400) => {
  msg.textContent = text;
  msg.hidden = false;
  clearTimeout(timer);
  if (ms) timer = setTimeout(() => (msg.hidden = true), ms);
};

async function start(m: typeof import('@svertik/engine/player')) {
  const { createEngine, createPlayer, prepareScene, effectTypes, sceneEffectTypes } = m;
  const hash = location.hash.match(/^#[ps]=(.+)$/);
  if (!hash) return say('No scene in this link.', 0);
  const state = await decodeState(hash[1]!);
  if (!state) return say('No scene in this link.', 0);
  const scene = state.scene;
  document.title = `${state.name} · svertik`;
  if (state.canvas) document.body.style.background = state.canvas;
  // El editor abre la misma escena (#s=…).
  edit.href = `./#s=${hash[1]}`;
  // Los efectos que la escena pide (y solo ellos). Los que no existen se avisan por consola.
  const unknown = sceneEffectTypes(scene).filter((t) => !effectTypes.includes(t));
  if (unknown.length) console.warn(`svertik: effects that don't exist: ${unknown.join(', ')}`);
  // Las fuentes de sus textos, de Fontsource (solo si hay textos), y el importador si trae SVG suelto.
  const effects = await prepareScene(scene);
  // Rendimiento: D o ?debug en la URL.
  const meter = createFpsMeter(document.body, new URLSearchParams(location.search).has('debug'));
  addEventListener('keydown', (e) => e.key.toLowerCase() === 'd' && !e.metaKey && !e.ctrlKey && meter.toggle());
  createPlayer(createEngine(effects), stage, scene, { onFrame: ({ ms }) => meter.frame(ms) });
}

void runStages(PLAY_STAGES, async () => {
  const m = await import('@svertik/engine/player');
  start(m);
});
