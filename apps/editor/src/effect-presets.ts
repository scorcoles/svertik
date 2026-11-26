/**
 * Presets of effects: a few ready looks per effect, shown as live thumbnails of the selected object above its
 * parameters. A preset sets its own values and puts every other one back to its default, except what places
 * the effect on this drawing or links it to the scene (centres, targets, the clock, seeds), which it keeps
 * unless it sets them itself. Values may be formulas: those that move with `scene.time` animate on hover.
 */
import { t } from '@svertik/ui/i18n';
import type { ParamSpec } from '@svertik/engine';
import { PARTICLE_PRESETS } from './particle-presets';

export interface EffectPreset {
  name: string;
  tip?: string;
  params: Record<string, unknown>;
}

const fx = (expr: string, fallback = 0) => ({ $expr: expr, fallback });

export const EFFECT_PRESETS: Record<string, EffectPreset[]> = {
  crack: [
    { name: t('Hairline'), params: { cracks: 4, length: 0.6, branching: 0.25, jagged: 0.3, width: 1, separation: 4 } },
    { name: t('Shattered'), params: { mode: 'shatter', cracks: 10, length: 1.2, branching: 0.6, separation: 14, variation: 0.6 } },
    { name: t('Sliced'), params: { pattern: 'slices', slices: 7, separation: 10, angleVariation: 8 } },
    { name: t('Earthquake'), params: { cracks: 8, length: 1.4, branching: 0.8, jagged: 0.9, separation: 20, growth: fx('clamp(scene.time / 2, 0, 1)', 1) } },
  ],
  clone: [
    { name: t('Grid'), params: { mode: 'grid', columns: 5, rows: 5, spacing: [1.2, 1.2] } },
    { name: t('Ring'), params: { mode: 'radial', count: 12, radius: 1.6 } },
    { name: t('Rings'), params: { mode: 'radial', count: 10, rings: 4, radius: 1.2, ringSpacing: 1.1 } },
    { name: t('Tunnel'), params: { mode: 'linear', count: 14, offset: [0, 0], scaleStep: 0.85, rotateStep: 12 } },
    { name: t('Scatter'), params: { mode: 'grid', columns: 6, rows: 6, spacing: [1.3, 1.3], jitter: [0.35, 0.35], scaleMin: 0.4, scaleMax: 1.2, rotateJitter: 180 } },
  ],
  noise: [
    { name: t('Wobble'), params: { amount: 0.02, scale: 3, evolution: fx('scene.time') } },
    { name: t('Jitter'), params: { amount: 0.05, scale: 12, evolution: fx('floor(scene.time * 8)') } },
    { name: t('Liquid'), params: { amount: 0.08, scale: 1.5, evolution: fx('scene.time * 0.5') } },
    { name: t('Scribble'), params: { amount: 0.03, scale: 25 } },
  ],
  wave: [
    { name: t('Flag'), params: { amplitude: 0.06, wavelength: 0.6, phase: fx('scene.time * 180') } },
    { name: t('Ripples'), params: { amplitude: 0.02, wavelength: 0.15, phase: fx('scene.time * 360') } },
    { name: t('Swell'), params: { amplitude: 0.15, wavelength: 1.5, phase: fx('scene.time * 90') } },
    { name: t('Vertical'), params: { amplitude: 0.05, wavelength: 0.4, direction: 90, phase: fx('scene.time * 180') } },
  ],
  ripple: [
    { name: t('Drop'), params: { amplitude: 0.03, wavelength: 0.12, decay: 2, phase: fx('scene.time * -360') } },
    { name: t('Sonar'), params: { amplitude: 0.05, wavelength: 0.3, decay: 0.5, phase: fx('scene.time * -180') } },
    { name: t('Tremor'), params: { amplitude: 0.01, wavelength: 0.05, decay: 0 } },
  ],
  twist: [
    { name: t('Swirl'), params: { angle: 180, radius: 0.8 } },
    { name: t('Vortex'), params: { angle: 540, radius: 1 } },
    { name: t('Twitch'), params: { angle: fx('45 * sin(scene.time * 4)'), radius: 0.6 } },
    { name: t('Unscrew'), params: { angle: -120, radius: 1.4 } },
  ],
  spherize: [
    { name: t('Bulge'), params: { strength: 0.6, radius: 0.6 } },
    { name: t('Pinch'), params: { strength: -0.6, radius: 0.6 } },
    { name: t('Lens'), params: { strength: 0.9, radius: 0.35 } },
    { name: t('Breathing'), params: { strength: fx('0.5 * sin(scene.time * 3)') } },
  ],
  bend: [
    { name: t('Arch'), params: { angle: 120 } },
    { name: t('Smile'), params: { angle: -90 } },
    { name: t('Ring'), params: { angle: 330 } },
    { name: t('Sway'), params: { angle: fx('60 * sin(scene.time * 2)') } },
  ],
  roughen: [
    { name: t('Hand-drawn'), params: { amount: 0.3, detail: 0.01 } },
    { name: t('Torn'), params: { amount: 0.9, detail: 0.03 } },
    { name: t('Fuzzy'), params: { amount: 0.6, detail: 0.005 } },
    { name: t('Koch'), params: { mode: 'koch', iterations: 3 } },
  ],
  spikes: [
    { name: t('Sun'), params: { count: 16, height: 40 } },
    { name: t('Thorns'), params: { count: 30, height: 22, curve: 0.8, width: 0.4 } },
    { name: t('Petals'), params: { count: 8, height: 40, curve: -0.8 } },
    { name: t('Spinning'), params: { count: 12, height: 35, phase: fx('mod(scene.time * 0.25, 1)') } },
  ],
  melt: [
    { name: t('Drip'), params: { amount: 0.25, drips: 6 } },
    { name: t('Meltdown'), params: { amount: 0.7, drips: 12, sharpness: 3 } },
    { name: t('Ooze'), params: { amount: fx('clamp(scene.time / 3, 0, 1) * 0.6', 0.3), drips: 8 } },
  ],
  explosion: [
    { name: t('Pop'), params: { amount: 0.4, force: 0.6 } },
    { name: t('Blast'), params: { amount: 1, force: 1.6, spin: 360, chaos: 0.8 } },
    { name: t('Drift'), params: { amount: 0.6, force: 0.3, spin: 30, shrink: 0, chaos: 0.2 } },
    { name: t('Boom'), params: { amount: fx('easeOut(clamp(scene.time / 1.5, 0, 1))', 1), force: 1.2, spin: 180 } },
  ],
  mosaic: [
    { name: t('Tiles'), params: { columns: 10, rows: 10, gutter: [3, 3] } },
    { name: t('Hexagons'), params: { tile: 'hexagon', columns: 12, rows: 12, gutter: [2, 2] } },
    { name: t('Triangles'), params: { tile: 'triangle', columns: 8, rows: 8 } },
    { name: t('Dots'), params: { tile: 'circle', columns: 14, rows: 14, gutter: [2, 2] } },
    { name: t('Stars'), params: { tile: 'star', columns: 9, rows: 9, fit: 'whole' } },
  ],
  voronoi: [
    { name: t('Cells'), params: { spacing: 32, gap: 2 } },
    { name: t('Dry earth'), params: { spacing: 22, jitter: 1, gap: 4 } },
    { name: t('Shards'), params: { spacing: 80, gap: 6 } },
    { name: t('Living'), params: { spacing: 40, gap: 3, drift: 0.3, time: fx('scene.time') } },
  ],
  halftone: [
    { name: t('Newsprint'), params: { spacing: 7, angle: 45, min: 0.35, max: 0.8 } },
    { name: t('Lines'), params: { spacing: 10, shape: 'line', angle: 30, min: 0.55, max: 0.95 } },
    { name: t('Big dots'), params: { spacing: 26, angle: 0, min: 0.7, max: 1.1 } },
    { name: t('Rings'), params: { spacing: 18, shape: 'ring', angle: 0, min: 0.6, max: 1 } },
    { name: t('Diamonds'), params: { spacing: 14, shape: 'diamond', angle: 0, min: 0.8, max: 1.05 } },
  ],
  crosshatch: [
    { name: t('Pen'), params: { spacing: 6, layers: 3, invert: true } },
    { name: t('Engraving'), params: { spacing: 3, layers: 2, width: 0.6, invert: true } },
    { name: t('Sketch'), params: { spacing: 9, layers: 4, width: 1.4, invert: true } },
    { name: t('Single'), params: { spacing: 5, layers: 1, angle: 30, invert: true } },
  ],
  dithering: [
    { name: t('Bayer'), params: { algorithm: 'bayer', spacing: 6 } },
    { name: t('Floyd–Steinberg'), params: { algorithm: 'floyd-steinberg', spacing: 5 } },
    { name: t('Atkinson'), params: { algorithm: 'atkinson', spacing: 5 } },
    { name: t('Coarse'), params: { spacing: 14, matrix: '2' } },
  ],
  rgbsplit: [
    { name: t('Subtle'), params: { distance: 3 } },
    { name: t('Glitch'), params: { distance: fx('step(0.6, noise(scene.time * 6)) * 14 + 2', 3) } },
    { name: t('Duo'), params: { mode: 'duo', distance: 8, angle: 45 } },
    { name: t('Vertical'), params: { distance: 8, angle: 90 } },
  ],
  glow: [
    { name: t('Neon'), params: { size: 12, strength: 1.2, color: '#09fdd1' } },
    { name: t('Soft'), params: { size: 30, strength: 0.6, color: '#ffffff' } },
    { name: t('Hot'), params: { size: 18, strength: 1.5, color: '#ff5a1f' } },
    { name: t('Pulse'), params: { size: fx('12 + 8 * sin(scene.time * 4)', 12), strength: 1 } },
  ],
  shadow: [
    { name: t('Soft'), params: { offset: [0, 12], blur: 18, opacity: 0.4 } },
    { name: t('Hard'), params: { offset: [10, 10], blur: 0, opacity: 0.9 } },
    { name: t('Floating'), params: { offset: [0, 30], blur: 30, opacity: 0.3 } },
    { name: t('Retro'), params: { offset: [8, 8], blur: 0, color: '#ff2bd6', opacity: 1 } },
  ],
  grain: [
    { name: t('Film'), params: { amount: 0.25, size: 1 } },
    { name: t('Heavy'), params: { amount: 0.6, size: 2 } },
  ],
  taper: [
    { name: t('Wedge'), params: { amount: 0.8 } },
    { name: t('Flare'), params: { amount: -0.6 } },
    { name: t('Vase'), params: { amount: 0.5, curve: 1 } },
    { name: t('Point'), params: { amount: 1 } },
  ],
  shear: [
    { name: t('Italic'), params: { x: 15 } },
    { name: t('Lean back'), params: { x: -25 } },
    { name: t('Skew'), params: { x: 20, y: 10 } },
    { name: t('Wobbly'), params: { x: fx('15 * sin(scene.time * 3)') } },
  ],
  cylinder: [
    { name: t('Can'), params: { wrap: 0.5 } },
    { name: t('Wrap'), params: { wrap: 0.9, perspective: 0.3 } },
    { name: t('Rolling'), params: { wrap: 0.6, rotation: fx('scene.time * 90') } },
  ],
  rotate3d: [
    { name: t('Tilt'), params: { rotateX: 45 } },
    { name: t('Card'), params: { rotateX: 0, rotateY: 40 } },
    { name: t('Floor'), params: { rotateX: 65, perspective: 1.2 } },
    { name: t('Spin'), params: { rotateX: 0, rotateY: fx('scene.time * 90') } },
  ],
  perspective: [
    { name: t('Floor'), params: { topLeft: [0.3, 0], topRight: [0.7, 0] } },
    { name: t('Wall left'), params: { topLeft: [0, 0.15], topRight: [1, 0], bottomRight: [1, 1], bottomLeft: [0, 0.85] } },
    { name: t('Wall right'), params: { topLeft: [0, 0], topRight: [1, 0.15], bottomRight: [1, 0.85], bottomLeft: [0, 1] } },
    { name: t('Tower'), params: { topLeft: [0, 0], topRight: [1, 0], bottomRight: [0.85, 1], bottomLeft: [0.15, 1] } },
  ],
  envelope: [
    { name: t('Arch'), params: { p10: [0.5, -0.3] } },
    { name: t('Bulge'), params: { p10: [0.5, -0.2], p12: [0.5, 1.2], p01: [-0.2, 0.5], p21: [1.2, 0.5] } },
    { name: t('Pinch'), params: { p10: [0.5, 0.2], p12: [0.5, 0.8], p01: [0.2, 0.5], p21: [0.8, 0.5] } },
    { name: t('Flag'), params: { p10: [0.5, -0.15], p12: [0.5, 0.85] } },
  ],
  compress: [
    { name: t('Band'), params: { strength: 0.9 } },
    { name: t('Spread'), params: { strength: -0.7 } },
    { name: t('Diagonal'), params: { start: 0.2, end: 0.8, strength: 0.8 } },
    { name: t('Vertical'), params: { axis: 'y', strength: 0.8 } },
  ],
  gather: [
    { name: t('Fan'), params: { start: 0.7, end: -0.7 } },
    { name: t('Lean'), params: { start: 0.6, end: 0.6 } },
    { name: t('Open'), params: { start: -0.5, end: 0.5 } },
    { name: t('Vertical'), params: { axis: 'y' } },
  ],
  blob: [
    { name: t('Pebble'), params: { roundness: 1 } },
    { name: t('Soft'), params: { roundness: 0.5 } },
    { name: t('Puffy'), params: { roundness: 1, inset: -20 } },
    { name: t('Slim'), params: { roundness: 1, inset: 15 } },
  ],
  roundcorners: [
    { name: t('Soft'), params: { radius: 12 } },
    { name: t('Pill'), params: { radius: 60 } },
    { name: t('Chamfer'), params: { shape: 'chamfer', radius: 16 } },
    { name: t('Random'), params: { corners: 'random', radius: 30 } },
  ],
  damage: [
    { name: t('Worn'), params: { cracks: 2, chips: 6, specks: 60 } },
    { name: t('Battered'), params: { cracks: 6, through: 2, chips: 16, specks: 150, roughness: 0.8 } },
    { name: t('Chipped'), params: { cracks: 0, chips: 20, chipSize: 0.05, specks: 10 } },
    { name: t('Aging'), params: { growth: fx('clamp(scene.time / 3, 0, 1)', 1), cracks: 5, chips: 10, specks: 120 } },
  ],
  slices: [
    { name: t('Glitch'), params: { count: 14, chance: 0.45, shift: 0.08 } },
    { name: t('Shredded'), params: { count: 40, chance: 0.8, shift: 0.03 } },
    { name: t('Jumpy'), params: { seed: fx('floor(scene.time * 8)', 1) } },
  ],
  blocks: [
    { name: t('Glitch'), params: { count: 8 } },
    { name: t('Heavy'), params: { count: 24, size: 0.12, shift: 0.1 } },
    { name: t('Flicker'), params: { count: 10, seed: fx('floor(scene.time * 10)', 1) } },
  ],
  radialcut: [
    { name: t('Pizza'), params: { count: 8, separation: 12 } },
    { name: t('Fan'), params: { count: 16, separation: 4, spin: 15 } },
    { name: t('Bloom'), params: { count: 12, separation: fx('20 + 20 * sin(scene.time * 2)', 20) } },
  ],
  pixelate: [
    { name: t('Pixels'), params: { size: 8 } },
    { name: t('Chunky'), params: { size: 20 } },
    { name: t('Dots'), params: { shape: 'dot', size: 10, gap: 2 } },
    { name: t('LED'), params: { shape: 'dot', size: 6, gap: 2 } },
  ],
  scanlines: [
    { name: t('CRT'), params: { count: 120, width: 0.5 } },
    { name: t('Blinds'), params: { count: 20, width: 3 } },
    { name: t('Fine'), params: { count: 240, width: 0.3 } },
  ],
  streaks: [
    { name: t('Light'), params: { count: 6 } },
    { name: t('Rain'), params: { count: 20, length: 0.3, width: 1 } },
    { name: t('Bites'), params: { count: 10, bite: 2, width: 3 } },
  ],
  trim: [
    { name: t('Half'), params: { end: 0.5 } },
    { name: t('Draw on'), params: { end: fx('clamp(scene.time / 2, 0, 1)', 1) } },
    { name: t('Runner'), params: { start: 0, end: 0.25, offset: fx('mod(scene.time * 0.5, 1)') } },
  ],
  fractal: [
    { name: t('Sierpinski'), params: { preset: 'sierpinski' } },
    { name: t('Carpet'), params: { preset: 'carpet' } },
    { name: t('Tree'), params: { preset: 'tree', depth: 7 } },
    { name: t('Spiral'), params: { preset: 'spiral', depth: 10 } },
  ],
  spirograph: [
    { name: t('Classic'), params: {} },
    { name: t('Flower'), params: { ring: 90, wheel: 30, pen: 1 } },
    { name: t('Outer'), params: { mode: 'epi', ring: 60, wheel: 20, pen: 0.8 } },
    { name: t('Turning'), params: { phase: fx('scene.time * 60') } },
  ],
  stringart: [
    { name: t('Rose'), params: { points: 120, skip: 37 } },
    { name: t('Star'), params: { points: 60, skip: 23 } },
    { name: t('Dense'), params: { points: 200, skip: 73 } },
    { name: t('Turning'), params: { phase: fx('scene.time * 20') } },
  ],
  flowfield: [
    { name: t('Wind'), params: { lines: 80, curl: 0.2 } },
    { name: t('Swirls'), params: { curl: 2, scale: 5 } },
    { name: t('Hair'), params: { lines: 200, length: 200, curl: 0.6 } },
    { name: t('Sparse'), params: { lines: 20, length: 600 } },
  ],
  wavelines: [
    { name: t('Ridges'), params: { spacing: 10, amplitude: 40, invert: true } },
    { name: t('Calm'), params: { amplitude: 8, wavelength: 300, invert: true } },
    { name: t('Dense'), params: { spacing: 5, width: 0.8, invert: true } },
    { name: t('Flowing'), params: { time: fx('scene.time'), speed: 1, invert: true } },
  ],
  metaball: [
    { name: t('Goo'), params: { reach: 30 } },
    { name: t('Melted'), params: { reach: 80 } },
    { name: t('Thin'), params: { reach: 20, grow: -10 } },
    { name: t('Fat'), params: { reach: 50, grow: 20 } },
  ],
  mirror: [
    { name: t('Side by side'), params: { axis: 'horizontal' } },
    { name: t('Above and below'), params: { axis: 'vertical' } },
    { name: t('Overlap'), params: { position: 0.5 } },
  ],
  color: [
    { name: t('Hue shift'), params: { mode: 'shift', hue: 60 } },
    { name: t('Random'), params: { mode: 'random', variation: 0.6 } },
    { name: t('Palette'), params: { mode: 'palette' } },
    { name: t('Gradient'), params: { mode: 'gradient' } },
    { name: t('Cycle'), params: { mode: 'shift', hue: fx('scene.time * 90') } },
  ],
  gradient: [
    { name: t('Mint'), params: {} },
    { name: t('Sunset'), params: { from: '#ff6b5e', to: '#ffc857', angle: 0 } },
    { name: t('Ocean'), params: { from: '#09fdd1', to: '#1b1464', angle: 45 } },
    { name: t('Radial'), params: { kind: 'radial', from: '#ffffff', to: '#5c3cff' } },
    { name: t('Neon'), params: { via: true, viaColor: '#ff2bd6' } },
  ],
  tint: [
    { name: t('Wash'), params: { color: '#ffffff', amount: 0.4 } },
    { name: t('Warm'), params: { color: '#ff8a3d', amount: 0.35 } },
    { name: t('Cool'), params: { color: '#4d8dff', amount: 0.35 } },
    { name: t('Night'), params: { color: '#1b1464', amount: 0.5 } },
  ],
  tone: [
    { name: t('Posterize'), params: { mode: 'posterize', levels: 4 } },
    { name: t('Duotone'), params: { mode: 'duotone' } },
    { name: t('Invert'), params: { mode: 'invert' } },
    { name: t('Riso'), params: { mode: 'duotone', dark: '#0078bf', light: '#ff48b0' } },
  ],
  vectorgrain: [
    { name: t('Soft edge'), params: {} },
    { name: t('Dusty'), params: { density: 4000, shape: 'speck' } },
    { name: t('Halo'), params: { edge: 'outside', falloff: 60 } },
    { name: t('Grit'), params: { interior: 0.5, density: 3000, shape: 'square', size: 0.8 } },
  ],
  blur: [
    { name: t('Soft'), params: { amount: 4 } },
    { name: t('Dreamy'), params: { amount: 12 } },
    { name: t('Motion'), params: { amount: 10, direction: 'horizontal' } },
    { name: t('Tilt-shift'), params: { amount: 8, area: 'band', invert: true } },
  ],
  feather: [
    { name: t('Soft'), params: { softness: 0.2 } },
    { name: t('Misty'), params: { softness: 0.5 } },
  ],
  displace: [
    { name: t('Heat'), params: { amount: 6, scale: 20 } },
    { name: t('Water'), params: { amount: 20, scale: 80 } },
    { name: t('Rough'), params: { amount: 40, scale: 10, detail: 4 } },
    { name: t('Shimmer'), params: { amount: 8, scale: 30, seed: fx('floor(scene.time * 12)', 1) } },
  ],
  bevel: [
    { name: t('Button'), params: {} },
    { name: t('Deep'), params: { depth: 12, height: 6 } },
    { name: t('Glossy'), params: { shine: 1.5, shininess: 60 } },
    { name: t('Soft'), params: { depth: 20, height: 2, strength: 0.5 } },
  ],
  thicken: [
    { name: t('Bold'), params: { amount: 6 } },
    { name: t('Thin'), params: { amount: -3 } },
    { name: t('Outline'), params: { mode: 'outline', amount: 4 } },
    { name: t('Sticker'), params: { mode: 'outline', amount: 12, color: '#ffffff' } },
  ],
  particles: [...PARTICLE_PRESETS] as EffectPreset[],
};

/**
 * Effects whose look lives in fine detail (dots, lines, grain): their thumbnails show a close-up of the middle
 * of the drawing, this fraction of its size, instead of the whole of it.
 */
export const PRESET_ZOOM: Record<string, number> = {
  halftone: 0.35, dithering: 0.35, crosshatch: 0.4, pixelate: 0.5, scanlines: 0.4, wavelines: 0.5, vectorgrain: 0.5, grain: 0.4,
};

/** What a preset keeps from the effect as it is (unless it sets it): its place on the drawing and its links. */
const KEPT_POINTS = new Set(['center', 'impact', 'pivot', 'start', 'end', 'target', 'focus']);
const kept = (name: string, spec: ParamSpec) =>
  name === 'time' || (spec.type === 'point' && KEPT_POINTS.has(name)) || spec.type === 'node' || spec.type === 'nodes' || spec.type === 'seed';

/** The effect's values with the preset applied: the preset's, the kept ones as they are, the rest at their default. */
/** A plain copy (values may come from the editor's reactive state, which structuredClone refuses). */
const copy = (value: unknown) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

export function presetValues(schema: Record<string, ParamSpec>, current: Record<string, unknown>, preset: EffectPreset): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(schema)) {
    if (name in preset.params) out[name] = copy(preset.params[name]);
    else if (kept(name, spec) && name in current) out[name] = copy(current[name]);
    else out[name] = copy((spec as { default?: unknown }).default);
  }
  return out;
}

/** Whether the effect is exactly as the preset leaves it (what it keeps aside). */
export function matchesPreset(schema: Record<string, ParamSpec>, current: Record<string, unknown>, preset: EffectPreset): boolean {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  return Object.entries(schema).every(([name, spec]) => {
    const value = name in current ? current[name] : (spec as { default?: unknown }).default;
    if (name in preset.params) return same(value, preset.params[name]);
    return kept(name, spec) || same(value, (spec as { default?: unknown }).default);
  });
}
