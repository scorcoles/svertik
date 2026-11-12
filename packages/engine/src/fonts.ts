// Fonts for the Text primitive: they are registered (with their bytes) and the engine takes each letter's
// outline from them. The engine downloads nothing by itself; `loadFont` / `loadFonts` (optional) fetch
// them from the free Fontsource catalogue (jsDelivr) when asked.
//
// opentype.js is only loaded when a font is actually parsed: it is heavy, and the minimal player
// («@svertik/engine/player») must not carry it if the scene has no text.
import type { Font } from 'opentype.js';

// In the browser it arrives as an ES module (with `parse`); in Node, as CommonJS (inside `default`).
type Parser = (data: ArrayBuffer) => Font;

let parser: Parser | null = null;

/** opentype.js, la primera vez que hace falta (y solo entonces). */
async function fontParser(): Promise<Parser> {
  if (!parser) {
    const mod = (await import('opentype.js')) as { parse?: Parser; default?: { parse?: Parser } };
    const p = mod.parse ?? mod.default?.parse;
    if (!p) throw new Error('svertik: opentype.js no trae «parse»');
    parser = p;
  }
  return parser;
}

const fonts = new Map<string, Font>();
let version = 0;

/** Registers a font by its name (the one the scene will store). Takes the bytes (.ttf, .otf, .woff). */
export async function registerFont(name: string, data: ArrayBuffer | Font): Promise<void> {
  fonts.set(name, data instanceof ArrayBuffer ? (await fontParser())(data) : data);
  version++;
}

export const fontNames = (): string[] => [...fonts.keys()];
export const hasFont = (name: string): boolean => fonts.has(name);
/** Changes every time a font is registered: text is drawn again. */
export const fontsVersion = (): number => version;

/**
 * The requested font or, if missing, the next one in the list (e.g. the same family at regular weight)
 * or, last, the first registered one (with `fallback` true).
 */
export function fontFor(...names: string[]): { font: Font; fallback: boolean } | null {
  for (const [i, name] of names.entries()) {
    const f = fonts.get(name);
    if (f) return { font: f, fallback: i > 0 };
  }
  const first = fonts.values().next();
  return first.done ? null : { font: first.value, fallback: true };
}

/** Name a font is registered under: the family; with another weight or italic, "Family 700 italic". */
export const fontKey = (family: string, weight = 400, italic = false): string =>
  weight === 400 && !italic ? family : `${family} ${weight}${italic ? ' italic' : ''}`;

/** A family's id in Fontsource (its name in lower case, with hyphens). */
export const fontsourceId = (family: string): string => family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * The styles of the old names: before weights existed, the style was part of the family name
 * ("JetBrains Mono Bold"). What each one meant.
 */
const LEGACY_STYLES: Record<string, { weight: number; italic: boolean }> = {
  thin: { weight: 100, italic: false },
  hairline: { weight: 100, italic: false },
  extralight: { weight: 200, italic: false },
  ultralight: { weight: 200, italic: false },
  light: { weight: 300, italic: false },
  regular: { weight: 400, italic: false },
  book: { weight: 400, italic: false },
  normal: { weight: 400, italic: false },
  medium: { weight: 500, italic: false },
  semibold: { weight: 600, italic: false },
  demibold: { weight: 600, italic: false },
  bold: { weight: 700, italic: false },
  extrabold: { weight: 800, italic: false },
  ultrabold: { weight: 800, italic: false },
  black: { weight: 900, italic: false },
  heavy: { weight: 900, italic: false },
  italic: { weight: 400, italic: true },
  bolditalic: { weight: 700, italic: true },
};

/**
 * Splits a legacy name ("JetBrains Mono Bold") into its family and the weight that style means.
 * Null when the name doesn't end with a style (then it is a family as it is).
 */
export function legacyStyle(name: string): { family: string; weight: number; italic: boolean } | null {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const style = LEGACY_STYLES[parts[parts.length - 1]!.toLowerCase()];
  if (!style) return null;
  return { family: parts.slice(0, -1).join(' '), weight: style.weight, italic: style.italic };
}

/** The .woff file of a Fontsource family (Latin alphabet), on jsDelivr. */
export const fontsourceURL = (family: string, weight = 400, italic = false): string =>
  `https://cdn.jsdelivr.net/fontsource/fonts/${fontsourceId(family)}@latest/latin-${weight}-${italic ? 'italic' : 'normal'}.woff`;

const pending = new Map<string, Promise<boolean>>();

/**
 * Downloads and registers a font from Fontsource (or from `url`). If that weight or italic doesn't exist,
 * it tries the regular family (400) and registers it under the requested name. Returns whether it worked.
 */
export function loadFont(family: string, weight = 400, italic = false, url?: string): Promise<boolean> {
  const key = fontKey(family, weight, italic);
  if (fonts.has(key)) return Promise.resolve(true);
  let p = pending.get(key);
  if (!p) {
    p = (async () => {
      const tries = [url ?? fontsourceURL(family, weight, italic), ...(weight !== 400 || italic ? [fontsourceURL(family)] : [])];
      // A legacy name ("JetBrains Mono Bold"): the family without the style, with the weight it means.
      const legacy = legacyStyle(family);
      if (legacy) tries.push(fontsourceURL(legacy.family, legacy.weight, legacy.italic), fontsourceURL(legacy.family));
      for (const u of tries) {
        try {
          const res = await fetch(u);
          if (!res.ok) continue;
          await registerFont(key, await res.arrayBuffer());
          return true;
        } catch {
          // No network or no such font: the next one.
        }
      }
      return false;
    })();
    pending.set(key, p);
    void p.then((ok) => !ok && pending.delete(key));
  }
  return p;
}

/** The fonts a scene's texts use (without repeats). */
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
