// Editor fonts for the Text primitive: free ones only. Commit Mono is bundled (the interface
// uses it); the others, from the Fontsource catalogue, are downloaded from jsDelivr when a text uses them.
// The scene stores family, weight and italic: the Play page and the exported code download them the same way.
import { fontKey, fontsourceId, fontsourceURL, hasFont, loadFont, registerFont } from '@svertik/engine';
import regular from '@fontsource/commit-mono/files/commit-mono-latin-400-normal.woff?url';
import bold from '@fontsource/commit-mono/files/commit-mono-latin-700-normal.woff?url';

export const BUNDLED: Record<string, string> = { [fontKey('Commit Mono')]: regular, [fontKey('Commit Mono', 700)]: bold };

/** Loads the bundled ones. */
export async function loadBundled() {
  await Promise.all(Object.entries(BUNDLED).map(async ([name, url]) => registerFont(name, await (await fetch(url)).arrayBuffer())));
}

/** Makes sure a font is registered: the bundled one or, otherwise, Fontsource's. */
export function ensureFont(family: string, weight = 400, italic = false): Promise<boolean> {
  if (hasFont(fontKey(family, weight, italic))) return Promise.resolve(true);
  return loadFont(family, weight, italic);
}

// ── Catalogue (editor only; loaded when the picker opens)

export interface CatalogFont {
  family: string;
  category: 'sans' | 'serif' | 'display' | 'hand' | 'mono' | 'other';
  weights: number[];
  italic: boolean;
  /** From the curated selection (few, varied, drawn well). */
  pick: boolean;
}
let catalog: Promise<CatalogFont[]> | null = null;
export const loadCatalog = () =>
  (catalog ??= import('./font-catalog.json').then((m) =>
    (m.default as [string, CatalogFont['category'], string, number, number][]).map(([family, category, w, i, pick]) => ({ family, category, weights: w.split(',').map(Number), italic: !!i, pick: !!pick })),
  ));

/** The available weight nearest to the requested one (and whether there is italic), per the catalogue. */
export function nearest(f: CatalogFont, weight: number, italic: boolean): { weight: number; italic: boolean } {
  const w = f.weights.reduce((best, x) => (Math.abs(x - weight) < Math.abs(best - weight) ? x : best), f.weights[0] ?? 400);
  return { weight: w, italic: italic && f.italic };
}

// ── Preview: the font as a web font (each family's name in its own typeface, and the text being
// edited on the canvas). Returns the CSS family name; each weight and style loads once.
const previewed = new Set<string>();
export function previewFamily(family: string, weight = 400, italic = false): string {
  const css = `sv-preview-${fontsourceId(family)}`;
  const key = fontKey(family, weight, italic);
  if (!previewed.has(key) && typeof FontFace !== 'undefined') {
    previewed.add(key);
    const face = new FontFace(css, `url(${fontsourceURL(family, weight, italic)})`, { weight: String(weight), style: italic ? 'italic' : 'normal' });
    face.load().then((f) => document.fonts.add(f)).catch(() => {});
  }
  return css;
}
