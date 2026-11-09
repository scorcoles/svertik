// Ejecuta el JS del panel en un Web Worker: sin acceso a la página y con freno si se cuelga.
import type { AnyScene, SceneNode } from '@svertik/engine';

export type RunnerMessage =
  | { type: 'scene'; scene: AnyScene }
  | { type: 'frame'; objects: SceneNode[]; fps: number }
  | { type: 'error'; message: string; line: number | null };

// Código del worker. El script se envuelve en una función: `onFrame` viene de fuera
// y la función devuelve la `scene` que haya declarado el usuario.
const WORKER = `
let fn = null, timer = null, t0 = 0, frames = 0, last = 0, fps = 0, scene = null;
const HEADER_LINES = 2;
function lineOf(e) {
  const m = /<anonymous>:(\\d+):(\\d+)/.exec(e && e.stack || '');
  return m ? Number(m[1]) - HEADER_LINES : null;
}
self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'run') {
    clearInterval(timer); fn = null;
    try {
      const body = msg.code.replace(/^\\s*import[^;]*;/gm, (s) => s.replace(/[^\\n]/g, ' '));
      const run = new Function('onFrame', body + '\\n;return typeof scene === "undefined" ? null : scene;');
      scene = run((f) => { fn = f; });
      if (!scene || !(Array.isArray(scene.objects) || Array.isArray(scene.stack))) throw new Error('The code must declare const scene = { … }');
      self.postMessage({ type: 'scene', scene });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err && err.message || err), line: lineOf(err) });
      return;
    }
    if (msg.play && fn) start();
  } else if (msg.type === 'play') { if (fn) start(); }
  else if (msg.type === 'stop') { clearInterval(timer); timer = null; }
};
function start() {
  clearInterval(timer); t0 = performance.now(); last = t0; frames = 0;
  timer = setInterval(() => {
    const now = performance.now();
    try { fn((now - t0) / 1000); }
    catch (err) { clearInterval(timer); timer = null; self.postMessage({ type: 'error', message: String(err && err.message || err), line: lineOf(err) }); return; }
    frames++;
    if (now - last >= 500) { fps = Math.round(frames * 1000 / (now - last)); frames = 0; last = now; }
    // v1 (una pila) se manda como un objeto, para que el editor lo trate igual.
    const objects = scene.objects || [{ kind: 'object', id: 'object-1', name: 'source.svg', source: scene.source, stack: scene.stack }];
    self.postMessage({ type: 'frame', objects, fps });
  }, 1000 / 60);
}
`;

export class Runner {
  #worker: Worker | null = null;
  #watchdog: ReturnType<typeof setTimeout> | undefined;
  #onmessage: (m: RunnerMessage) => void;

  constructor(onmessage: (m: RunnerMessage) => void) {
    this.#onmessage = onmessage;
  }

  #spawn() {
    const url = URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' }));
    const w = new Worker(url);
    URL.revokeObjectURL(url);
    w.onmessage = (e: MessageEvent<RunnerMessage>) => {
      this.#feed();
      this.#onmessage(e.data);
    };
    this.#worker = w;
  }

  /** Si el worker deja de hablar (bucle infinito), se mata. */
  #feed(ms = 1500) {
    clearTimeout(this.#watchdog);
    this.#watchdog = setTimeout(() => {
      this.kill();
      this.#onmessage({ type: 'error', message: 'Script stopped: it took too long (infinite loop?)', line: null });
    }, ms);
  }

  run(code: string, play: boolean) {
    if (!this.#worker) this.#spawn();
    this.#feed();
    this.#worker!.postMessage({ type: 'run', code, play });
  }
  play() {
    this.#feed();
    this.#worker?.postMessage({ type: 'play' });
  }
  stop() {
    clearTimeout(this.#watchdog);
    this.#worker?.postMessage({ type: 'stop' });
  }
  /** Tras `run` sin animación, el worker queda callado: eso no es un cuelgue. */
  idle() {
    clearTimeout(this.#watchdog);
  }
  kill() {
    clearTimeout(this.#watchdog);
    this.#worker?.terminate();
    this.#worker = null;
  }
}
