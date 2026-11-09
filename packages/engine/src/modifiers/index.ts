import { bend } from './bend';
import { clone } from './clone';
import { crack } from './crack';
import { noise } from './noise';
import { rotate3d } from './rotate3d';
import { spherize } from './spherize';
import { step } from './step';
import { transform } from './transform';
import { twist } from './twist';
import { wave } from './wave';

export { bend, clone, crack, noise, rotate3d, spherize, step, transform, twist, wave };

/** Todos los modificadores incluidos. Quien quiera menos peso, que importe solo los suyos. */
export const builtins = [transform, rotate3d, spherize, twist, bend, wave, noise, crack, clone, step];
