import { bend } from './bend';
import { noise } from './noise';
import { spherize } from './spherize';
import { transform } from './transform';
import { twist } from './twist';
import { wave } from './wave';

export { bend, noise, spherize, transform, twist, wave };

/** Todos los modificadores incluidos. Quien quiera menos peso, que importe solo los suyos. */
export const builtins = [transform, spherize, twist, bend, wave, noise];
