import { cylinder } from './cylinder';
import { envelope } from './envelope';
import { melt } from './melt';
import { mirror } from './mirror';
import { paint } from './paint';
import { perspective } from './perspective';
import { ripple } from './ripple';
import { shear } from './shear';
import { taper } from './taper';
import { tint } from './tint';
import { bend } from './bend';
import { color } from './color';
import { clone } from './clone';
import { crack } from './crack';
import { noise } from './noise';
import { rotate3d } from './rotate3d';
import { spherize } from './spherize';
import { step } from './step';
import { transform } from './transform';
import { twist } from './twist';
import { wave } from './wave';

export { bend, clone, color, crack, cylinder, envelope, melt, mirror, noise, paint, perspective, ripple, rotate3d, shear, spherize, step, taper, tint, transform, twist, wave };

/** Todos los modificadores incluidos. Quien quiera menos peso, que importe solo los suyos. */
export const builtins = [
  transform,
  rotate3d,
  spherize,
  twist,
  bend,
  taper,
  shear,
  wave,
  ripple,
  noise,
  melt,
  cylinder,
  perspective,
  envelope,
  crack,
  clone,
  mirror,
  step,
  color,
  tint,
  paint,
];
