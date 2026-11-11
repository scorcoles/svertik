// Palettes: the built-in ones, the colours a scene uses and swapping them for a palette's.

import { parseColor, rgbToOklab, toHex } from './color';
import { walkNodes, type SceneV2 } from './document';
import type { ModifierInstance } from './engine';

/** The name of the "palette" with the document's colours (first in the picker). */
export const DOCUMENT_PALETTE = 'In this document';

export interface Palette {
  name: string;
  colors: string[];
}

/** Built-in palettes (dark to light, roughly). */
export const PALETTES: Palette[] = [
  { name: 'svertik', colors: ['#0d0d10', '#25252d', '#7a7a88', '#8a5cff', '#ff4fa3', '#09fdd1', '#ffd23f', '#f4f4f4'] },
  { name: 'Ember', colors: ['#1c0f13', '#4a1a24', '#8f2d2f', '#d2502f', '#f08a3c', '#f9c46b', '#fdebc8'] },
  { name: 'Lagoon', colors: ['#071a2b', '#0d3b5c', '#11668a', '#1c9bb0', '#5cc8c2', '#a9e6d6', '#eefaf4'] },
  { name: 'Riso', colors: ['#1a1a1a', '#2f4bd8', '#ff48b0', '#ffe800', '#00a95c', '#f3efe6'] },
  { name: 'Pastel', colors: ['#5b5f7a', '#9aa5d6', '#b9e2d8', '#f6d6a8', '#f4b6c2', '#fbf6ef'] },
  { name: 'Neon', colors: ['#0a0614', '#3d0b6b', '#ff2e88', '#ff9a00', '#c6ff00', '#00f0ff'] },
  { name: 'Earth', colors: ['#2a221b', '#5c4632', '#8b6b47', '#a8a060', '#c9b98b', '#efe6d2'] },
  { name: 'Mono', colors: ['#000000', '#262626', '#4d4d4d', '#808080', '#b3b3b3', '#e0e0e0', '#ffffff'] },
];

const HEX = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi;
const full = (m: string) => (m.length === 4 ? `#${[...m.slice(1)].map((c) => c + c).join('')}` : m).toLowerCase();

/** Every string in the scene that may hold colours: parameters, SVG sources and animation keys. */
function eachText(scene: SceneV2, fn: (value: string, set: (v: string) => void) => void) {
  const visit = (obj: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(obj)) if (typeof v === 'string') fn(v, (nv) => (obj[k] = nv));
  };
  const stack = (list: ModifierInstance[]) => list.forEach((m) => { if (m.params) visit(m.params); stack(m.children ?? []); });
  for (const { node } of walkNodes(scene.objects)) {
    if (node.kind === 'shape') visit(node.params);
    if (node.kind === 'object' && node.source) fn(node.source, (v) => (node.source = v));
    stack(node.stack);
  }
  for (const tr of scene.animation?.tracks ?? []) for (const k of tr.keys) if (typeof k.value === 'string') fn(k.value, (v) => (k.value = v));
}

/** The colours (hex) the scene uses, without repeats, in order of appearance. */
export function sceneColors(scene: SceneV2): string[] {
  const out = new Set<string>();
  eachText(scene, (v) => {
    for (const m of v.match(HEX) ?? []) out.add(full(m));
  });
  return [...out];
}

const lightness = (hex: string) => {
  const c = parseColor(hex);
  return c ? rgbToOklab(c)[0] : 0;
};

/**
 * Which palette colour each scene colour gets: by lightness (OKLab), darkest to the palette's darkest and
 * lightest to its lightest, spread in proportion. Contrast is preserved.
 */
export function paletteMap(colors: string[], palette: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const src = [...new Set(colors.map(full))].sort((a, b) => lightness(a) - lightness(b));
  const dst = [...new Set(palette.map(full))].sort((a, b) => lightness(a) - lightness(b));
  if (!src.length || !dst.length) return map;
  src.forEach((c, i) => {
    const k = src.length === 1 ? Math.floor((dst.length - 1) / 2) : Math.round((i * (dst.length - 1)) / (src.length - 1));
    map.set(c, dst[k]!);
  });
  return map;
}

/** Swaps the scene's colours (in place) for the palette's. Returns how many colours changed. */
export function applyPalette(scene: SceneV2, palette: string[]): number {
  const map = paletteMap(sceneColors(scene), palette);
  let changed = 0;
  for (const [a, b] of map) if (a !== b) changed++;
  if (!changed) return 0;
  eachText(scene, (v, set) => {
    const next = v.replace(HEX, (m) => map.get(full(m)) ?? m);
    if (next !== v) set(next);
  });
  return changed;
}

/** A colour, normalised (#rrggbb); null if it isn't one. */
export const normalizeHex = (c: string): string | null => {
  const p = parseColor(c);
  return p ? toHex([p[0], p[1], p[2], 1]) : null;
};
