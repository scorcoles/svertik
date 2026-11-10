// Fuentes del editor para la primitiva Text: solo libres. JetBrains Mono viene incluida (la usa la
// interfaz); las demás, del catálogo de Fontsource, se bajan de jsDelivr cuando un texto las usa.
// La escena guarda la familia, el peso y la cursiva: la página Play y el código exportado las bajan igual.
import { fontKey, fontsourceId, fontsourceURL, hasFont, loadFont, registerFont } from '@svertik/engine';
import regular from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?url';
import bold from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff?url';

// «JetBrains Mono Bold»: el nombre de antes de tener pesos (proyectos ya guardados).
export const BUNDLED: Record<string, string> = { [fontKey('JetBrains Mono')]: regular, [fontKey('JetBrains Mono', 700)]: bold, 'JetBrains Mono Bold': bold };

/** Carga las incluidas. */
export async function loadBundled() {
  await Promise.all(Object.entries(BUNDLED).map(async ([name, url]) => registerFont(name, await (await fetch(url)).arrayBuffer())));
}

/** Se asegura de que una fuente está registrada: la incluida o, si no, la de Fontsource. */
export function ensureFont(family: string, weight = 400, italic = false): Promise<boolean> {
  if (hasFont(fontKey(family, weight, italic))) return Promise.resolve(true);
  return loadFont(family, weight, italic);
}

// ── Catálogo (solo en el editor; se carga al abrir el selector)

export interface CatalogFont {
  family: string;
  category: 'sans' | 'serif' | 'display' | 'hand' | 'mono' | 'other';
  weights: number[];
  italic: boolean;
  /** De la selección propia (pocas, variadas, que se dibujan bien). */
  pick: boolean;
}
let catalog: Promise<CatalogFont[]> | null = null;
export const loadCatalog = () =>
  (catalog ??= import('./font-catalog.json').then((m) =>
    (m.default as [string, CatalogFont['category'], string, number, number][]).map(([family, category, w, i, pick]) => ({ family, category, weights: w.split(',').map(Number), italic: !!i, pick: !!pick })),
  ));

/** El peso disponible más cercano al pedido (y si hay cursiva), según el catálogo. */
export function nearest(f: CatalogFont, weight: number, italic: boolean): { weight: number; italic: boolean } {
  const w = f.weights.reduce((best, x) => (Math.abs(x - weight) < Math.abs(best - weight) ? x : best), f.weights[0] ?? 400);
  return { weight: w, italic: italic && f.italic };
}

// ── Vista previa: el nombre de cada familia escrito en su letra (como fuente web, solo para la lista)
const previewed = new Set<string>();
export function previewFamily(family: string): string {
  const css = `sv-preview-${fontsourceId(family)}`;
  if (!previewed.has(family) && typeof FontFace !== 'undefined') {
    previewed.add(family);
    const face = new FontFace(css, `url(${fontsourceURL(family)})`);
    face.load().then((f) => document.fonts.add(f)).catch(() => {});
  }
  return css;
}
