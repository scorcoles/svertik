// Página de Play (play.html#p=…): la escena de un enlace compartido, a pantalla completa, con el
// mismo reproductor que el código exportado. Solo carga el motor: sin el editor ni su interfaz.
import { PLAY_STAGES, runStages } from './boot';
import { createFpsMeter } from './fpsmeter';
import { decodeState } from './share';

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

async function start(m: typeof import('@svertik/engine')) {
  const { builtins, createEngine, createPlayer, loadFonts, validateScene } = m;
  const hash = location.hash.match(/^#[ps]=(.+)$/);
  if (!hash) return say('No scene in this link.', 0);
  const state = await decodeState(hash[1]!);
  if (!state) return say('No scene in this link.', 0);
  const scene = state.scene;
  const report = validateScene(scene, builtins);
  if (report.errors.length) return say(`This scene cannot be played: ${report.errors[0]}`, 0);
  if (report.warnings.length) console.warn(`svertik: ${report.warnings.length} problem(s) in the scene:\n${report.warnings.join('\n')}`);
  document.title = `${state.name} · svertik`;
  if (state.canvas) document.body.style.background = state.canvas;
  // El editor abre la misma escena (#s=…).
  edit.href = `./#s=${hash[1]}`;
  // Las fuentes de sus textos, de Fontsource (solo si hay textos).
  await loadFonts(scene);
  // Rendimiento: D o ?debug en la URL.
  const meter = createFpsMeter(document.body, new URLSearchParams(location.search).has('debug'));
  addEventListener('keydown', (e) => e.key.toLowerCase() === 'd' && !e.metaKey && !e.ctrlKey && meter.toggle());
  createPlayer(createEngine(builtins), stage, scene, { onFrame: ({ ms }) => meter.frame(ms) });
}

document.getElementById('share')!.addEventListener('click', async () => {
  const url = location.href;
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title: document.title, url });
    } catch {
      // Cancelado.
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    say('Link copied');
  } catch {
    say('Could not copy the link');
  }
});

void runStages(PLAY_STAGES, async () => {
  const m = await import('@svertik/engine');
  start(m);
});
