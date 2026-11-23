// The golden file: what the engine did with each corpus scene.
//
// It is updated on purpose (`pnpm --filter @svertik/engine corpus:update`), never by
// accident: if a test fails, the change is real and needs a look.

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

/** A frame key: lap and time (five decimals). */
export const keyOf = (lap: number, t: number): string => `${lap}·${t.toFixed(5)}`;
