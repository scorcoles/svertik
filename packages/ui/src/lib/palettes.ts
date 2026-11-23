// Palettes for the colour picker: the app provides them by context (so they reach every ColorField without
// passing them through each panel). Without context, the picker shows only white, greys, black and the document.
import { getContext, setContext } from 'svelte';
import { DOCUMENT_PALETTE } from '@svertik/engine';
export { DOCUMENT_PALETTE };

export interface PaletteChoice {
  /** The palettes that can be chosen (without the document's, which always goes first). */
  readonly list: { name: string; colors: string[] }[];
  /** The one shown in the picker: a name from `list` or `DOCUMENT_PALETTE`. */
  readonly current: string;
  select(name: string): void;
}

const KEY = Symbol('sv-palettes');

export const providePalettes = (choice: PaletteChoice) => setContext(KEY, choice);
export const usePalettes = (): PaletteChoice | undefined => getContext<PaletteChoice | undefined>(KEY);
