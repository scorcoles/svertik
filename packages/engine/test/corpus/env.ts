// El entorno del corpus, fuera del navegador (los scripts se ejecutan con tsx, no con vitest).
//
// El importador de SVG necesita un DOMParser; en Node se usa el de happy-dom (como hace la CLI).

import { Window } from 'happy-dom';

const g = globalThis as unknown as { DOMParser?: unknown; document?: unknown };
const win = new Window();
g.DOMParser ??= win.DOMParser;
g.document ??= win.document;

export {};
