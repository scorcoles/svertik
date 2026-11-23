// The corpus environment, outside the browser (the scripts run with tsx, not vitest).
//
// The SVG importer needs a DOMParser; in Node it uses happy-dom's (as the CLI does).

import { Window } from 'happy-dom';

const g = globalThis as unknown as { DOMParser?: unknown; document?: unknown };
const win = new Window();
g.DOMParser ??= win.DOMParser;
g.document ??= win.document;

export {};
