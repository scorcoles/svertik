import { crossFillProject, demoProject, gravityProject, orbitProject, pointerProject, reelProject, shatterProject } from './demo';

/** Shared by both menus and the loader: one place for labels, order, factories and presentation. */
export const DEMOS = [
  { which: 'intro', label: 'Intro: the logo', create: demoProject, view: 'timeline' },
  { which: 'gravity', label: 'Gravity: a circle falls apart', create: gravityProject, view: 'canvas' },
  { which: 'crossfill', label: 'Pattern: a triangle filled with crosses', create: crossFillProject, view: 'canvas' },
  { which: 'shatter', label: 'Shatter: a triangle that explodes', create: shatterProject, view: 'timeline' },
  { which: 'reel', label: 'Reel: motion graphics in three acts', create: reelProject, view: 'timeline' },
  { which: 'orbit', label: 'Orbit: the Utils working together', create: orbitProject, view: 'timeline' },
  { which: 'pointer', label: 'Pointer: it follows your mouse', create: pointerProject, view: 'presenter' },
] as const;

export type DemoName = (typeof DEMOS)[number]['which'];
