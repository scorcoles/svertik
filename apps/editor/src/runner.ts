// Runs the panel's JS (svertikJS) in a Web Worker: no access to the page, and stopped if it hangs.
import type { SceneV1 } from '@svertik/engine';

export type RunnerMessage =
  | { type: 'scene'; scene: SceneV1; warnings: string[] }
  | { type: 'error'; message: string; line: number | null; stack?: string };

export class Runner {
  #worker: Worker | null = null;
  #watchdog: ReturnType<typeof setTimeout> | undefined;
  #onmessage: (m: RunnerMessage) => void;

  constructor(onmessage: (m: RunnerMessage) => void) {
    this.#onmessage = onmessage;
  }

  #spawn() {
    const w = new Worker(new URL('./runner.worker.ts', import.meta.url), { type: 'module' });
    // The worker answers each run once (a scene or an error): after that it is quiet, not stuck.
    w.onmessage = (e: MessageEvent<RunnerMessage>) => {
      this.idle();
      this.#onmessage(e.data);
    };
    this.#worker = w;
  }

  /** If the worker stops talking (an infinite loop), it is killed. */
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
  /** After `run` without animation the worker goes quiet: that is not a hang. */
  idle() {
    clearTimeout(this.#watchdog);
  }
  kill() {
    clearTimeout(this.#watchdog);
    this.#worker?.terminate();
    this.#worker = null;
  }
}
