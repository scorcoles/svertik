import '@fontsource/commit-mono/400.css';
import '@fontsource/commit-mono/700.css';
// The Play page (play.html#p=…): a shared link's scene, full screen, with the
// same player as the exported code. It loads only the engine: no editor or its interface.
// And only what the scene uses: its effects load on demand (see "prepareScene").
import { t } from '@svertik/ui/i18n';
import { loadLocale } from './i18n';
import { runStages, type BootStage } from './stages';
import { createFpsMeter } from './fpsmeter';
import { downloadFrame } from './capture';
import { stateFromHash } from './share';

/**
 * Play mode stages: the engine (runtime) and, with the scene, its effects (each its own chunk).
 * No UI: the play.html#p=… loader loads them and then starts the player.
 */
const PLAY_STAGES: BootStage[] = [
  { id: 'engine', label: 'Loading Engine', run: async () => { await import('@svertik/engine/player'); } },
];

const stage = document.getElementById('stage') as unknown as SVGSVGElement;
const msg = document.getElementById('msg')!;
const tools = document.getElementById('tools')!;
// Embeds can hide export controls; standalone playback keeps them by default.
const query = new URLSearchParams(location.search);
tools.hidden = query.get('controls') === '0';
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
  // Texts come in English and show in the page's language.
  msg.textContent = t(text);
  msg.hidden = false;
  clearTimeout(timer);
  if (ms) timer = setTimeout(() => (msg.hidden = true), ms);
};

async function start(m: typeof import('@svertik/engine/player')) {
  const { createEngine, createPlayer, prepareScene, effectTypes, sceneEffectTypes, evaluateSceneVariables, describeSceneVariables } = m;
  // #p=…: the scene itself; #l=…: a short link's scene, fetched from the link service.
  if (location.hash.startsWith('#l=')) say('Loading scene…', 0);
  const found = await stateFromHash(location.hash);
  if (!found) return say('No scene in this link.', 0);
  msg.hidden = true;
  const { state } = found;
  const scene = state.scene;
  stage.classList.toggle('full-viewport', !!m.viewportFit(scene));
  sceneName = state.name;
  document.title = `${state.name} · svertik`;
  if (state.canvas) document.body.style.background = state.canvas;
  // The effects the scene asks for (and only those). Unknown ones are reported in the console.
  const unknown = sceneEffectTypes(scene).filter((t) => !effectTypes.includes(t));
  if (unknown.length) console.warn(`svertik: effects that don't exist: ${unknown.join(', ')}`);
  // Its texts' fonts, from Fontsource (only with text), and the importer if it carries raw SVG.
  const effects = await prepareScene(scene);
  // Heavy frames paint on a canvas; ?renderer=svg|canvas|auto in the URL chooses, and so does the debug panel.
  const asked = query.get('renderer');
  const initial = asked === 'svg' || asked === 'canvas' ? asked : 'auto';
  let player: ReturnType<typeof createPlayer> | null = null;
  // Performance: D or ?debug in the URL.
  // As the editor counts them: every object but groups (and layers).
  const objectCount = [...m.walkNodes(scene.objects)].filter((x) => x.node.kind !== 'group').length;
  const meter = createFpsMeter(document.body, query.has('debug'), { onRenderer: (r) => player?.setRenderer(r), onWire: () => wire.toggle() });
  addEventListener('keydown', (e) => e.key.toLowerCase() === 'd' && !e.metaKey && !e.ctrlKey && meter.toggle());
  // Wire (W, or ?wire in the URL): outlines only, as in the editor's canvas.
  const wire = m.installWire(stage, scene, { initial: query.has('wire'), onChange: (on) => { document.body.classList.toggle('wire', on); meter.wire(on); } });
  player = createPlayer(createEngine(effects), stage, scene, { renderer: initial, pointer: () => meter.visible(), onFrame: ({ ms, t, pointer, runtime, painted, shapes }) => {
    meter.frame(ms);
    meter.counts(objectCount, shapes);
meter.renderer(painted, player?.renderer() ?? initial);
    const values = evaluateSceneVariables(scene, t);
    meter.variables(describeSceneVariables(values, pointer, runtime), values.custom);
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
    video.textContent = t('Cancel');
    video.setAttribute('aria-label', t('Cancel MP4 export'));
    video.title = t('Cancel MP4 export');
    say('Preparing MP4…', 0);
    try {
      // Keep the encoder out of the normal playback download.
      const { downloadMP4 } = await import('./video');
      await downloadMP4(createEngine(effects), scene, {
        background: getComputedStyle(document.body).backgroundColor,
        name: sceneName,
        viewport,
        signal: controller.signal,
        onProgress: progress => say(t('Exporting MP4… {percent}%', { percent: Math.round(progress * 100) }), 0),
      });
      say('MP4 downloaded');
    } catch (error) {
      say(controller.signal.aborted ? 'MP4 export cancelled' : error instanceof Error ? error.message : 'Could not export MP4.');
    } finally {
      exportController = null;
      video.replaceChildren(...videoIcon);
      video.setAttribute('aria-label', t('Export one cycle as MP4'));
      video.title = t('Export one cycle as MP4');
    }
  });
}

void (async () => {
  // The language first: the loading screen and the buttons already speak it.
  await loadLocale();
  for (const button of [capture, video]) {
    const label = t(button.getAttribute('aria-label') ?? '');
    button.setAttribute('aria-label', label);
    button.title = label;
  }
  await runStages(PLAY_STAGES.map((s) => ({ ...s, label: t(s.label) })), async () => {
    const m = await import('@svertik/engine/player');
    start(m);
  });
})();
