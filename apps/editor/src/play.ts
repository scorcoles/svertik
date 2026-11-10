// Página de Play (play.html#p=…): la escena de un enlace compartido, a pantalla completa, con el
// mismo reproductor que el código exportado. Solo carga el motor: sin el editor ni su interfaz.
import { builtins, createEngine, createPlayer, migrateScene, walkNodes } from '@svertik/engine';
import { loadBundled } from './fonts';
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

async function start() {
  const m = location.hash.match(/^#[ps]=(.+)$/);
  const state = m ? await decodeState(m[1]!) : null;
  if (!state) return say('No scene in this link.', 0);
  const scene = migrateScene(state.scene, state.name.endsWith('.svg') ? state.name : `${state.name}.svg`);
  document.title = `${state.name} · svertik`;
  if (state.canvas) document.body.style.background = state.canvas;
  // El editor abre la misma escena (#s=…).
  edit.href = `./#s=${m![1]}`;
  // Las fuentes incluidas, solo si hay textos.
  if ([...walkNodes(scene.objects)].some(({ node }) => node.kind === 'shape' && node.shape === 'text')) await loadBundled();
  createPlayer(createEngine(builtins), stage, scene);
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

void start();
