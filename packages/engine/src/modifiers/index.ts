import { cylinder } from './cylinder';
import { envelope } from './envelope';
import { explosion } from './explosion';
import { field } from './field';
import { fractal } from './fractal';
import { glitch } from './glitch';
import { gradient } from './gradient';
import { melt } from './melt';
import { mirror } from './mirror';
import { morph } from './morph';
import { mosaic } from './mosaic';
import { paint } from './paint';
import { pathwrap } from './pathwrap';
import { perspective } from './perspective';
import { range } from './range';
import { ripple } from './ripple';
import { roughenModifier as roughen } from './roughen';
import { shear } from './shear';
import { taper } from './taper';
import { tint } from './tint';
import { bend } from './bend';
import { boolean } from './boolean';
import { color } from './color';
import { clone } from './clone';
import { crack } from './crack';
import { damage } from './damage';
import { noise } from './noise';
import { opacity } from './opacity';
import { rotate3d } from './rotate3d';
import { spherize } from './spherize';
import { step } from './step';
import { transform } from './transform';
import { twist } from './twist';
import { wave } from './wave';

export { bend, boolean, clone, color, crack, cylinder, damage, envelope, explosion, field, fractal, glitch, gradient, melt, mirror, morph, mosaic, noise, opacity, paint, pathwrap, perspective, range, ripple, rotate3d, roughen, shear, spherize, step, taper, tint, transform, twist, wave };

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
  roughen,
  melt,
  cylinder,
  perspective,
  envelope,
  pathwrap,
  morph,
  crack,
  damage,
  clone,
  mirror,
  mosaic,
  fractal,
  glitch,
  boolean,
  step,
  range,
  field,
  explosion,
  color,
  tint,
  paint,
  gradient,
  opacity,
];
