// The effects, one by one, so that a player can load only the ones a scene uses.
//
// Each entry is a dynamic import: the bundler makes a chunk per effect module, and the minimal player
// («@svertik/engine/player») only downloads the ones that the scene's JSON mentions. The editor and the
// CLI, which need all of them, keep using the barrel (`./index`).
//
// The name of the effect is the key here; it must match the `type` of the modifier it loads
// (there is a test that checks it).

import type { ModifierDef } from '../modifier';

/** Loads the definition of an effect (a module can hold more than one). */
export type EffectLoader = () => Promise<ModifierDef<any>[]>;

/** One effect of a module. */
const one =
  (load: () => Promise<Record<string, unknown>>, key: string): EffectLoader =>
  async () => [(await load())[key] as ModifierDef<any>];

/** Every effect, by name: what the scene's JSON asks for. */
export const effectLoaders: Record<string, EffectLoader> = {
  // Deform
  bend: one(() => import('./bend'), 'bend'),
  bones: one(() => import('./bones'), 'bones'),
  cylinder: one(() => import('./cylinder'), 'cylinder'),
  envelope: one(() => import('./envelope'), 'envelope'),
  followpath: one(() => import('./followpath'), 'followpath'),
  lookat: one(() => import('./lookat'), 'lookat'),
  melt: one(() => import('./melt'), 'melt'),
  noise: one(() => import('./noise'), 'noise'),
  pathwrap: one(() => import('./pathwrap'), 'pathwrap'),
  perspective: one(() => import('./perspective'), 'perspective'),
  ripple: one(() => import('./ripple'), 'ripple'),
  rotate3d: one(() => import('./rotate3d'), 'rotate3d'),
  roughen: one(() => import('./roughen'), 'roughenModifier'),
  roundcorners: one(() => import('./roundcorners'), 'roundcorners'),
  shear: one(() => import('./shear'), 'shear'),
  spherize: one(() => import('./spherize'), 'spherize'),
  taper: one(() => import('./taper'), 'taper'),
  transform: one(() => import('./transform'), 'transform'),
  twist: one(() => import('./twist'), 'twist'),
  wave: one(() => import('./wave'), 'wave'),
  // Generate
  boolean: one(() => import('./boolean'), 'boolean'),
  clone: one(() => import('./clone'), 'clone'),
  connect: one(() => import('./connect'), 'connect'),
  crack: one(() => import('./crack'), 'crack'),
  damage: one(() => import('./damage'), 'damage'),
  explosion: one(() => import('./explosion'), 'explosion'),
  fractal: one(() => import('./fractal'), 'fractal'),
  halftone: one(() => import('./halftone'), 'halftone'),
  metaball: one(() => import('./metaball'), 'metaball'),
  mirror: one(() => import('./mirror'), 'mirror'),
  morph: one(() => import('./morph'), 'morph'),
  mosaic: one(() => import('./mosaic'), 'mosaic'),
  pixelate: one(() => import('./pixelate'), 'pixelate'),
  trace: one(() => import('./trace'), 'trace'),
  trim: one(() => import('./trim'), 'trim'),
  // Effect (per element)
  field: one(() => import('./field'), 'field'),
  range: one(() => import('./range'), 'range'),
  stagger: one(() => import('./stagger'), 'stagger'),
  step: one(() => import('./step'), 'step'),
  // Style
  color: one(() => import('./color'), 'color'),
  gradient: one(() => import('./gradient'), 'gradient'),
  mask: one(() => import('./mask'), 'mask'),
  opacity: one(() => import('./opacity'), 'opacity'),
  paint: one(() => import('./paint'), 'paint'),
  tint: one(() => import('./tint'), 'tint'),
  // Filters
  bevel: one(() => import('./filters'), 'bevel'),
  blur: one(() => import('./filters'), 'blur'),
  displace: one(() => import('./filters'), 'displace'),
  glow: one(() => import('./filters'), 'glow'),
  grain: one(() => import('./filters'), 'grain'),
  shadow: one(() => import('./filters'), 'shadow'),
  thicken: one(() => import('./filters'), 'thicken'),
  tone: one(() => import('./filters'), 'tone'),
  // Glitch
  blocks: one(() => import('./glitch'), 'blocks'),
  rgbsplit: one(() => import('./glitch'), 'rgbsplit'),
  scanlines: one(() => import('./glitch'), 'scanlines'),
  slices: one(() => import('./glitch'), 'slices'),
  streaks: one(() => import('./glitch'), 'streaks'),
};

/** The name of every effect that exists: what a scene's JSON can ask for. */
export const effectTypes: string[] = Object.keys(effectLoaders);
