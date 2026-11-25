/**
 * Motion/lifecycle presets preserve the source geometry and paint. Colors/filters remain separate effects.
 * Each sets its own Reference size, so a preset behaves the same whatever the size of the source artwork;
 * sizes and speeds below are fractions of that reference.
 */
import { t } from '@svertik/ui/i18n';

export const PARTICLE_PRESETS = [
  { name: t('Dust'), tip: t('Motes hanging in the air: a slow, prewarmed drift with gentle turbulence'), params: {
    emission: 'stream', count: 220, lifetime: 9, lifetimeRandom: .5, rate: 26, prewarm: true, referenceSize: 400,
    emitter: 'box', area: [2, 1.2], direction: -90, spread: 360, speed: .03, speedRandom: .8, gravity: 0, drag: 1.2,
    wind: [.035, -.012], turbulence: .1, turbulenceFrequency: .16, spin: 15, size: .016, sizeRandom: .75,
    fadeIn: .25, fade: .4, sizeEnd: .6 } },
  { name: t('Sparks'), tip: t('Grinder sparks: fast streaks that arc down under gravity and burn out'), params: {
    emission: 'stream', count: 240, lifetime: 1.2, lifetimeRandom: .5, rate: 160, prewarm: true, referenceSize: 450,
    emitter: 'point', direction: -65, spread: 40, speed: 1.7, speedRandom: .55, gravity: 2.6, drag: .25,
    turbulence: .01, turbulenceFrequency: 1.2, rotationRandom: 0, spin: 0, alignToMotion: true, stretch: 2.2,
    size: .01, sizeRandom: .4, fadeIn: 0, fade: .45, sizeEnd: .3 } },
  { name: t('Confetti'), tip: t('A party popper: a wide burst that slows down and flutters as it falls'), params: {
    emission: 'burst', count: 160, lifetime: 5, lifetimeRandom: .35, referenceSize: 320, emitter: 'point',
    direction: -90, spread: 110, speed: 1.4, speedRandom: .55, gravity: .35, drag: 1.4, wind: [.04, 0],
    turbulence: .14, turbulenceFrequency: .9, spin: 420, size: .04, sizeRandom: .45, fade: .25, sizeEnd: .8 } },
  { name: t('Fireworks'), tip: t('A shell bursting into a sphere of streaks that droop and fade'), params: {
    emission: 'burst', count: 140, lifetime: 2.4, lifetimeRandom: .3, referenceSize: 400, emitter: 'point',
    direction: -90, spread: 360, speed: 1.5, speedRandom: .25, gravity: .45, drag: 1.8, rotationRandom: 0, spin: 0,
    alignToMotion: true, stretch: 3, size: .012, sizeRandom: .3, fade: .55, sizeEnd: .3 } },
  { name: t('Fountain'), tip: t('A jet thrown up in a narrow cone that falls back in arcs'), params: {
    emission: 'stream', count: 260, lifetime: 1.7, lifetimeRandom: .15, rate: 110, prewarm: true, referenceSize: 400,
    emitter: 'point', direction: -90, spread: 34, speed: 1.4, speedRandom: .15, gravity: 2.1, drag: .1,
    rotationRandom: 0, spin: 0, alignToMotion: true, stretch: .35, size: .018, sizeRandom: .4, fade: .3, sizeEnd: .5 } },
  { name: t('Rain'), tip: t('Falling streaks from a wide line, slanted by the wind'), params: {
    emission: 'stream', count: 300, lifetime: 1, lifetimeRandom: .2, rate: 190, prewarm: true, referenceSize: 400,
    emitter: 'line', area: [2.2, 0], direction: 100, spread: 3, speed: 2.4, speedRandom: .2, gravity: 0, drag: 0,
    rotationRandom: 0, spin: 0, alignToMotion: true, stretch: 1.4, size: .01, sizeRandom: .3, fadeIn: .05, fade: .1 } },
  { name: t('Snow'), tip: t('Flakes drifting down from a wide line, swaying side to side'), params: {
    emission: 'stream', count: 220, lifetime: 10, lifetimeRandom: .3, rate: 22, prewarm: true, referenceSize: 400,
    emitter: 'line', area: [2.2, 0], direction: 90, spread: 20, speed: .12, speedRandom: .4, gravity: 0, drag: 0,
    wind: [.02, 0], turbulence: .12, turbulenceFrequency: .3, spin: 40, size: .016, sizeRandom: .6,
    fadeIn: .08, fade: .15 } },
  { name: t('Smoke'), tip: t('A rising plume that slows, swells and dissolves, bent by the wind'), params: {
    emission: 'stream', count: 90, lifetime: 4.5, lifetimeRandom: .25, rate: 18, prewarm: true, referenceSize: 400,
    emitter: 'circle', area: [.06, .06], direction: -90, spread: 26, speed: .3, speedRandom: .4, gravity: 0, drag: .7,
    wind: [.07, 0], turbulence: .1, turbulenceFrequency: .25, spin: 30, size: .05, sizeRandom: .4,
    fadeIn: .15, fade: .8, sizeEnd: 3.5 } },
  { name: t('Bubbles'), tip: t('Bubbles rising from a strip, wobbling and growing a little'), params: {
    emission: 'stream', count: 80, lifetime: 5, lifetimeRandom: .3, rate: 14, prewarm: true, referenceSize: 400,
    emitter: 'box', area: [1.2, .08], direction: -90, spread: 8, speed: .28, speedRandom: .5, gravity: 0, drag: 0,
    turbulence: .05, turbulenceFrequency: .7, rotationRandom: 0, spin: 0, size: .03, sizeRandom: .7,
    fadeIn: .06, fade: .12, sizeEnd: 1.35 } },
  { name: t('Swirl'), tip: t('A continuous spiral with smooth seeded wandering'), params: {
    emission: 'stream', count: 280, lifetime: 5, lifetimeRandom: .15, rate: 65, prewarm: true, referenceSize: 320,
    emitter: 'circle', area: [.08, .08], direction: 0, spread: 24, speed: .5, speedRandom: .2, gravity: 0, drag: .3,
    swirl: 150, turbulence: .025, turbulenceFrequency: .3, size: .024, sizeRandom: .5, spin: 40, fadeIn: .08,
    fade: .45, sizeEnd: .1 } },
] as const;
