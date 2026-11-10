// Fuentes para la primitiva Text: se registran (con sus bytes) y el motor saca de ellas el contorno de
// cada letra. El motor no descarga nada por su cuenta; `loadFont` / `loadFonts` (opcionales) bajan las
// del catálogo libre de Fontsource (jsDelivr) cuando se les pide.
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

/**
 * La fuente pedida o, si no está, la siguiente de la lista (p. ej. la misma familia en su peso normal)
 * o, al final, la primera registrada (con `fallback` a true).
 */
export function fontFor(...names: string[]): { font: Font; fallback: boolean } | null {
  for (const [i, name] of names.entries()) {
    const f = fonts.get(name);
    if (f) return { font: f, fallback: i > 0 };
  }
  const first = fonts.values().next();
  return first.done ? null : { font: first.value, fallback: true };
}

/** Nombre con que se registra una fuente: la familia; con otro peso o cursiva, «Familia 700 italic». */
export const fontKey = (family: string, weight = 400, italic = false): string =>
  weight === 400 && !italic ? family : `${family} ${weight}${italic ? ' italic' : ''}`;

/** Id de una familia en Fontsource (su nombre en minúsculas, con guiones). */
export const fontsourceId = (family: string): string => family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** El archivo .woff de una familia de Fontsource (alfabeto latino), en jsDelivr. */
export const fontsourceURL = (family: string, weight = 400, italic = false): string =>
  `https://cdn.jsdelivr.net/fontsource/fonts/${fontsourceId(family)}@latest/latin-${weight}-${italic ? 'italic' : 'normal'}.woff`;

const pending = new Map<string, Promise<boolean>>();

/**
 * Baja y registra una fuente de Fontsource (o de `url`). Si ese peso o la cursiva no existen, prueba con
 * la familia normal (400) y la registra con el nombre pedido. Devuelve si quedó registrada.
 */
export function loadFont(family: string, weight = 400, italic = false, url?: string): Promise<boolean> {
  const key = fontKey(family, weight, italic);
  if (fonts.has(key)) return Promise.resolve(true);
  let p = pending.get(key);
  if (!p) {
    p = (async () => {
      const tries = [url ?? fontsourceURL(family, weight, italic), ...(weight !== 400 || italic ? [fontsourceURL(family)] : [])];
      for (const u of tries) {
        try {
          const res = await fetch(u);
          if (!res.ok) continue;
          registerFont(key, await res.arrayBuffer());
          return true;
        } catch {
          // Sin red o sin esa fuente: la siguiente.
        }
      }
      return false;
    })();
    pending.set(key, p);
    void p.then((ok) => !ok && pending.delete(key));
  }
  return p;
}

/** Las fuentes que usan los textos de una escena (sin repetir). */
export function fontsOf(params: Iterable<Record<string, unknown>>): { family: string; weight: number; italic: boolean; key: string }[] {
  const out = new Map<string, { family: string; weight: number; italic: boolean; key: string }>();
  for (const p of params) {
    const family = String(p.font ?? 'JetBrains Mono');
    const weight = Number(p.weight ?? 400);
    const italic = !!p.italic;
    const key = fontKey(family, weight, italic);
    out.set(key, { family, weight, italic, key });
  }
  return [...out.values()];
}
