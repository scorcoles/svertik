import { printPosterProject } from './demo-poster';
import { tileWallProject } from './demo-tiles';
import { weaveProject } from './demo-weave';
import { contourProject } from './demo-contour';
import { voronoiProject } from './demo-voronoi';
import { timeRemapProject, compositionsProject, crossFillProject, motionProject, rhythmProject, demoProject, gravityProject, ricochetProject, orbitProject, pointerProject, reelProject, shatterProject } from './demo';

/** Shared by both menus and the loader: one place for labels, order, factories and presentation. */
export const DEMOS = [
  { which: 'intro', label: 'Intro: the logo', create: demoProject, view: 'timeline' },
  { which: 'gravity', label: 'Gravity: a circle falls apart', create: gravityProject, view: 'canvas' },
  { which: 'ricochet', label: 'Physics: rounded hexagon ricochet', create: ricochetProject, view: 'canvas' },
  { which: 'timeremap', label: 'Time Remap: freeze and rewind BOOM', create: timeRemapProject, view: 'timeline' },
  { which: 'compositions', label: 'Compositions: BOOM at two speeds', create: compositionsProject, view: 'canvas' },
  { which: 'crossfill', label: 'Pattern: a triangle filled with crosses', create: crossFillProject, view: 'canvas' },
  { which: 'motion', label: 'Motion: oscillating and wiggling crosses', create: motionProject, view: 'canvas' },
  { which: 'rhythm', label: 'Rhythm: pulses and staggered impacts', create: rhythmProject, view: 'canvas' },
  { which: 'shatter', label: 'Shatter: a triangle that explodes', create: shatterProject, view: 'timeline' },
  { which: 'reel', label: 'Reel: motion graphics in three acts', create: reelProject, view: 'timeline' },
  { which: 'orbit', label: 'Orbit: the Utils working together', create: orbitProject, view: 'timeline' },
  { which: 'pointer', label: 'Pointer: it follows your mouse', create: pointerProject, view: 'presenter' },
  { which: 'tilewall', label: 'Tile Wall: a procedural wall of chamfered tiles', create: tileWallProject, view: 'canvas' },
  { which: 'weave', label: 'Weave: a breathing moiré grid with Gather', create: weaveProject, view: 'canvas' },
  { which: 'contour', label: 'Contour: an isobar poster', create: contourProject, view: 'canvas' },
  { which: 'voronoi', label: 'Voronoi: a fault-line color study', create: voronoiProject, view: 'canvas' },
  { which: 'poster', label: 'Print Poster: a 1200×4800 glitch print', create: printPosterProject, view: 'canvas' },
] as const;

export type DemoName = (typeof DEMOS)[number]['which'];
