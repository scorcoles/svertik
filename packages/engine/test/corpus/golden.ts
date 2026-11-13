// El fichero dorado: lo que el motor hizo con cada escena del corpus.
//
// Se actualiza a propósito (con `pnpm --filter @svertik/engine corpus:update`), nunca por
// accidente: si una prueba falla, el cambio es real y hay que mirarlo.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const file = resolve(here, 'golden.json');

/** Caso → fotograma (vuelta·instante) → huella. */
export type Golden = Record<string, Record<string, string>>;

export const readGolden = (): Golden =>
  existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Golden) : {};

export const writeGolden = (g: Golden): void => {
  writeFileSync(file, `${JSON.stringify(g, null, 1)}\n`);
};

/** La clave de un fotograma: vuelta e instante (con cinco decimales). */
export const keyOf = (lap: number, t: number): string => `${lap}·${t.toFixed(5)}`;
