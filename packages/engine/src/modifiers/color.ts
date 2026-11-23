import { hslToRgb, mixColor, parseColor, rgbToHsl, toHex } from '../color';
import type { Shape, Style } from '../geometry';
import { defineModifier } from '../modifier';
import { rng } from '../random';

/**
 * Colour variation per element (Clone copies; without Clone, each shape):
 * shift rotates the hue and adjusts saturation and lightness; gradient spreads a gradient; random varies at random.
 */
export const color = defineModifier({
  type: 'color',
  label: 'Color',
  kind: 'style',
  params: {
    mode: { type: 'enum', default: 'shift', options: ['solid', 'shift', 'gradient', 'random', 'palette'] as const, animatable: false },
    palette: { type: 'palette', default: ['#ff6b5e', '#ffc857', '#09fdd1', '#4d8dff', '#b894f6'], label: 'Colors', group: 'Palette', animatable: false, showIf: { mode: ['palette'] } },
    paletteMode: { type: 'enum', default: 'random', options: ['random', 'index'] as const, label: 'Choose', group: 'Palette', animatable: false, showIf: { mode: ['palette'] } },
    index: { type: 'number', default: 0, step: 1, label: 'Index', group: 'Palette', showIf: { mode: ['palette'], paletteMode: ['index'] } },
    color: { type: 'color', default: '#D2502F', solid: true, label: 'Color', showIf: { mode: ['solid'] } },
    hue: { type: 'angle', default: 30, label: 'Hue', random: [-180, 180], showIf: { mode: ['shift'] } },
    saturation: { type: 'number', default: 0, min: -1, max: 1, step: 0.01, random: [-0.4, 0.4], showIf: { mode: ['shift'] } },
    lightness: { type: 'number', default: 0, min: -1, max: 1, step: 0.01, random: [-0.3, 0.3], showIf: { mode: ['shift'] } },
    from: { type: 'color', solid: true, default: '#09fdd1', group: 'Gradient' },
    to: { type: 'color', solid: true, default: '#ff6b5e', group: 'Gradient' },
    variation: { type: 'number', default: 0.3, min: 0, max: 1, step: 0.01, group: 'Random' },
    seed: { type: 'seed', default: 1, group: 'Random' },
    target: { type: 'enum', default: 'fill', options: ['fill', 'stroke', 'both'] as const, animatable: false },
  },
  apply(geo, p) {
    const tagged = geo.shapes.some((s) => s.clone !== undefined);
    const keyOf = (s: Shape, i: number) => (tagged ? (s.clone ?? -1) : i);
    const keys = [...new Set(geo.shapes.map(keyOf))].filter((k) => k >= 0).sort((a, b) => a - b);
    const index = new Map(keys.map((k, i) => [k, i]));
    const n = keys.length;
    const props = p.target === 'both' ? ['fill', 'stroke'] : [p.target];
    const palette = (Array.isArray(p.palette) ? p.palette : []).map(c => typeof c === 'string' ? parseColor(c) : null).filter(c => c !== null);
    const paletteIndex = Number.isFinite(p.index) ? Math.floor(p.index) : 0;
    const paletteColor = (key: number, emission?: number) => {
      if (!palette.length) return undefined;
      if (p.paletteMode === 'index') return toHex(palette[((paletteIndex % palette.length) + palette.length) % palette.length]!);
      // Mouse copies from one input event share a palette choice; ordinary elements (including
      // Clone copies) each get their own stable choice from the effect seed and element key.
      const seed = emission !== undefined
        ? (p.seed >>> 0) ^ Math.imul(emission, 0x9e3779b9)
        : p.seed * 7919 + key;
      return toHex(palette[Math.floor(rng(seed)() * palette.length)]!);
    };
    const assigned = typeof p.color === 'string' ? parseColor(p.color) : null;
    const from = parseColor(p.from) ?? [0, 0, 0, 1];
    const to = parseColor(p.to) ?? [255, 255, 255, 1];

    const recolor = (value: string | undefined, prop: string, i: number, key: number, emission?: number): string | undefined => {
      if (p.mode === 'palette') {
        const pick = paletteColor(key, emission);
        return value === 'none' || value === 'transparent' || !pick ? value : pick;
      }
      if (p.mode === 'solid') return value === 'none' || !assigned ? value : toHex(assigned);
      // Without a declared fill, SVG paints black.
      const c = parseColor(value ?? (prop === 'fill' ? '#000000' : undefined));
      if (!c) return value;
      if (p.mode === 'gradient') return toHex(mixColor(from, to, n > 1 ? i / (n - 1) : 0));
      const [h, s, l] = rgbToHsl(c);
      if (p.mode === 'random') {
        const r = rng(p.seed * 7919 + key);
        return toHex(hslToRgb(h + (r() - 0.5) * 2 * p.variation * 180, s, l + (r() - 0.5) * p.variation * 0.6, c[3]));
      }
      return toHex(hslToRgb(h + p.hue, s + p.saturation, l + p.lightness, c[3]));
    };

    const shapes = geo.shapes.map((shape, si) => {
      const key = keyOf(shape, si);
      const i = index.get(key);
      if (i === undefined) return shape;
      const style: Style = { ...shape.style };
      for (const prop of props) {
        if (prop === 'stroke' && !style.stroke) continue;
        const next = recolor(style[prop], prop, i, key, shape.emission);
        if (next !== undefined) style[prop] = next;
      }
      return { ...shape, style };
    });
    return { viewBox: geo.viewBox, shapes };
  },
});
