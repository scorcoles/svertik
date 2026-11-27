// The JS tab's code, run away from the page: svertikJS builds the scene, and errors say on which line.
import { runCode } from '@svertik/js';

// `runCode` wraps the code in a function whose header takes two lines.
const HEADER_LINES = 2;
const lineOf = (e: unknown) => {
  const m = /<anonymous>:(\d+):(\d+)/.exec((e instanceof Error && e.stack) || '');
  return m ? Number(m[1]) - HEADER_LINES : null;
};

self.onmessage = (e: MessageEvent<{ type: 'run'; code: string }>) => {
  if (e.data.type !== 'run') return;
  try {
    // The editor previews the scene live; frame callbacks are for the exported player.
    const { scene, warnings } = runCode(e.data.code, { onFrame: () => {} });
    self.postMessage({ type: 'scene', scene, warnings });
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err instanceof Error && err.message) || err), line: lineOf(err), stack: String((err instanceof Error && err.stack) || '') });
  }
};
