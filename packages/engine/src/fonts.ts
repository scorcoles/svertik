// Fuentes para la primitiva Text: se registran (con sus bytes) y el motor saca de ellas el contorno de
// cada letra. El motor no descarga nada: el editor (o quien lo use) registra las que tenga.
import * as opentype from 'opentype.js';
import type { Font } from 'opentype.js';

// En el navegador llega como módulo ES (con `parse`); en Node, como CommonJS (dentro de `default`).
const parse: (data: ArrayBuffer) => Font = (opentype as { parse?: typeof opentype.parse }).parse ?? (opentype as unknown as { default: typeof opentype }).default.parse;

const fonts = new Map<string, Font>();
let version = 0;

/** Registra una fuente por su nombre (el que guardará la escena). Acepta los bytes (.ttf, .otf, .woff). */
export function registerFont(name: string, data: ArrayBuffer | Font): void {
  fonts.set(name, data instanceof ArrayBuffer ? parse(data) : data);
  version++;
}

export const fontNames = (): string[] => [...fonts.keys()];
export const hasFont = (name: string): boolean => fonts.has(name);
/** Cambia cada vez que se registra una fuente: el texto se vuelve a dibujar. */
export const fontsVersion = (): number => version;

/** La fuente pedida o, si no está, la primera registrada (con `fallback` a true). */
export function fontFor(name: string): { font: Font; fallback: boolean } | null {
  const f = fonts.get(name);
  if (f) return { font: f, fallback: false };
  const first = fonts.values().next();
  return first.done ? null : { font: first.value, fallback: true };
}
