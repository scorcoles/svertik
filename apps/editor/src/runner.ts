// Ejecuta el JS del panel en un Web Worker: sin acceso a la página y con freno si se cuelga.
import type { SceneV1 } from '@svertik/engine';

export type RunnerMessage =
  | { type: 'scene'; scene: SceneV1 }
  | { type: 'error'; message: string; line: number | null; stack?: string };

// Código del worker. El script se envuelve en una función: `onFrame` viene de fuera
// y la función devuelve la `scene` que haya declarado el usuario.
const WORKER = `
let scene = null;
const HEADER_LINES = 2;
function lineOf(e) {
  const m = /<anonymous>:(\\d+):(\\d+)/.exec(e && e.stack || '');
  return m ? Number(m[1]) - HEADER_LINES : null;
}
self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'run') {
    try {
      const body = msg.code.replace(/^\\s*import[^;]*;/gm, (s) => s.replace(/[^\\n]/g, ' '));
      const run = new Function('onFrame', body + '\\n;return typeof scene === "undefined" ? null : scene;');
      // The editor previews the scene live; frame callbacks are for the exported player.
      scene = run(() => {});
      if (!scene || !(Array.isArray(scene.objects) || Array.isArray(scene.stack))) throw new Error('The code must declare const scene = { … }');
      self.postMessage({ type: 'scene', scene });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err && err.message || err), line: lineOf(err), stack: String(err && err.stack || '') });
      return;
    }
  }
};
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
    // The worker answers each run once (a scene or an error): after that it is quiet, not stuck.
    w.onmessage = (e: MessageEvent<RunnerMessage>) => {
      this.idle();
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

  run(code: string) {
    if (!this.#worker) this.#spawn();
    this.#feed();
    this.#worker!.postMessage({ type: 'run', code });
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
