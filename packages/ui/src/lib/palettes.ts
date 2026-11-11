// Paletas para el selector de color: la app las da por contexto (así llegan a todos los ColorField sin
// pasarlas por cada panel). Sin contexto, el selector enseña solo blanco, grises, negro y el documento.
import { getContext, setContext } from 'svelte';
import { DOCUMENT_PALETTE } from '@svertik/engine';
export { DOCUMENT_PALETTE };

export interface PaletteChoice {
  /** Las paletas que se pueden elegir (sin la del documento, que va siempre la primera). */
  readonly list: { name: string; colors: string[] }[];
  /** La que se ve en el selector: un nombre de `list` o `DOCUMENT_PALETTE`. */
  readonly current: string;
  select(name: string): void;
}

const KEY = Symbol('sv-palettes');

export const providePalettes = (choice: PaletteChoice) => setContext(KEY, choice);
export const usePalettes = (): PaletteChoice | undefined => getContext<PaletteChoice | undefined>(KEY);
