// SVG filters: they don't change the geometry; they apply to the whole object when it is painted (shadow,
// blur, glow, grain, displacement…). The browser computes them: cheap to tweak, but a large or animated
// blur costs when painting, especially on phones. Units: the document's (px).
import type { Geometry } from '../geometry';
import { defineModifier, type FilterPlace, type ParamSpec } from '../modifier';

const same = (geo: Geometry) => geo;
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const n = (v: number) => String(Math.round(v * 1000) / 1000);

// ── Area: the whole filter, or only inside a circle or a band (with a soft transition to the original).
const zoned = { area: ['radial', 'band'] } as const;
const AREA = {
  area: { type: 'enum', default: 'all', options: ['all', 'radial', 'band'] as const, label: 'Area', group: 'Area', animatable: false },
  center: { type: 'point', default: [0.5, 0.5], unit: 'fraction', label: 'Center', group: 'Area', showIf: zoned },
  radius: { type: 'number', default: 0.3, min: 0, max: 2, step: 0.01, unit: 'fraction', label: 'Radius', group: 'Area', showIf: zoned },
  falloff: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'Falloff', group: 'Area', showIf: zoned },
  angle: { type: 'angle', default: 0, label: 'Angle', group: 'Area', ramp: false, showIf: { area: ['band'] } },
  invert: { type: 'boolean', default: false, label: 'Invert', group: 'Area', showIf: zoned },
} satisfies Record<string, ParamSpec>;
type AreaParams = { area: string; center: [number, number]; radius: number; falloff: number; angle: number; invert: boolean };

/**
 * The effect (written into `<id>-e`) only where the area says: a mask with a gradient (radial, or a
 * band), inside the filter itself as an image; where it is opaque, the effect; where not, the original.
 */
function withArea(p: AreaParams, place: FilterPlace, io: { input: string; out: string; id: string }, effect: (out: string) => string): string {
  if (p.area !== 'radial' && p.area !== 'band') return effect(io.out);
  const [rx, ry, rw, rh] = place.region;
  const [cx, cy] = place.point(p.center[0], p.center[1]);
  const r = Math.max(1e-3, p.radius * place.size);
  const f = Math.min(1, Math.max(0.001, p.falloff));
  const [on, off] = p.invert ? [0, 1] : [1, 0];
  const stop = (o: number, a: number) => `<stop offset="${n(o)}" stop-color="#fff" stop-opacity="${a}"/>`;
  let grad: string;
  if (p.area === 'radial') {
    grad = `<radialGradient id="m" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}">${stop(1 - f, on)}${stop(1, off)}</radialGradient>`;
  } else {
    // Band along `angle` (plus the object's rotation); its width, 2 × radius.
    const a = ((p.angle + place.rotation) * Math.PI) / 180;
    const [nx, ny] = [-Math.sin(a), Math.cos(a)];
    grad = `<linearGradient id="m" gradientUnits="userSpaceOnUse" x1="${n(cx - nx * r)}" y1="${n(cy - ny * r)}" x2="${n(cx + nx * r)}" y2="${n(cy + ny * r)}">${stop(0, off)}${stop(f / 2, on)}${stop(1 - f / 2, on)}${stop(1, off)}</linearGradient>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(rx)} ${n(ry)} ${n(rw)} ${n(rh)}" width="${n(rw)}" height="${n(rh)}" preserveAspectRatio="none"><defs>${grad}</defs><rect x="${n(rx)}" y="${n(ry)}" width="${n(rw)}" height="${n(rh)}" fill="url(#m)"/></svg>`;
  const id = io.id;
  return (
    effect(`${id}-e`) +
    `<feImage href="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" x="${n(rx)}" y="${n(ry)}" width="${n(rw)}" height="${n(rh)}" preserveAspectRatio="none" result="${id}-m"/>` +
    `<feComposite in="${id}-e" in2="${id}-m" operator="in" result="${id}-ei"/>` +
    `<feComposite in="${io.input}" in2="${id}-m" operator="out" result="${id}-io"/>` +
    `<feMerge result="${io.out}"><feMergeNode in="${id}-io"/><feMergeNode in="${id}-ei"/></feMerge>`
  );
}

/** Shadow: a blurred, shifted copy behind, in one colour. */
export const shadow = defineModifier({
  type: 'shadow',
  label: 'Shadow',
  kind: 'filter',
  params: {
    offset: { type: 'point', default: [6, 8], unit: 'px', step: 0.5, label: 'Offset', handle: false, random: [-20, 20] },
    blur: { type: 'number', default: 6, min: 0, max: 100, step: 0.5, unit: 'px', label: 'Blur' },
    color: { type: 'color', default: '#000000', label: 'Color' },
    opacity: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'Opacity' },
  },
  apply: same,
  filter: (p, { input, out }) =>
    `<feDropShadow in="${input}" dx="${n(p.offset[0])}" dy="${n(p.offset[1])}" stdDeviation="${n(Math.max(0, p.blur) / 2)}" flood-color="${esc(p.color)}" flood-opacity="${n(p.opacity)}" result="${out}"/>`,
  filterPad: (p) => Math.max(Math.abs(p.offset[0]), Math.abs(p.offset[1])) + p.blur * 1.5 + 2,
});

/** Blur: in both directions, or only one (a sense of motion); whole or only in an area. */
export const blur = defineModifier({
  type: 'blur',
  label: 'Blur',
  kind: 'filter',
  params: {
    amount: { type: 'number', default: 4, min: 0, max: 100, step: 0.5, unit: 'px', label: 'Amount' },
    direction: { type: 'enum', default: 'both', options: ['both', 'horizontal', 'vertical'] as const, label: 'Direction', animatable: false },
    ...AREA,
  },
  apply: same,
  filter: (p, io, place) => {
    const s = Math.max(0, p.amount) / 2;
    const [x, y] = p.direction === 'horizontal' ? [s, 0] : p.direction === 'vertical' ? [0, s] : [s, s];
    return withArea(p, place, io, (out) => `<feGaussianBlur in="${io.input}" stdDeviation="${n(x)} ${n(y)}" result="${out}"/>`);
  },
  filterPad: (p) => p.amount * 1.5 + 2,
});

/** Glow: a coloured halo around (behind the drawing). */
export const glow = defineModifier({
  type: 'glow',
  label: 'Glow',
  kind: 'filter',
  params: {
    size: { type: 'number', default: 10, min: 0, max: 100, step: 0.5, unit: 'px', label: 'Size' },
    color: { type: 'color', default: '#09fdd1', label: 'Color' },
    strength: { type: 'number', default: 0.8, min: 0, max: 3, step: 0.05, label: 'Strength' },
  },
  apply: same,
  filter: (p, { input, out, id }) => {
    // Above 1: the halo adds to itself (more intense, without growing).
    const layers = Math.max(1, Math.ceil(p.strength));
    const each = Math.min(1, p.strength / layers);
    const halo = Array.from({ length: layers }, () => `<feMergeNode in="${id}-c"/>`).join('');
    return (
      `<feGaussianBlur in="${input}" stdDeviation="${n(Math.max(0, p.size) / 2)}" result="${id}-b"/>` +
      `<feFlood flood-color="${esc(p.color)}" flood-opacity="${n(each)}"/>` +
      `<feComposite in2="${id}-b" operator="in" result="${id}-c"/>` +
      `<feMerge result="${out}">${halo}<feMergeNode in="${input}"/></feMerge>`
    );
  },
  filterPad: (p) => p.size * 1.5 + 2,
});

/** Grain: fine noise over the drawing (only inside it), like film or print. */
export const grain = defineModifier({
  type: 'grain',
  label: 'Grain',
  kind: 'filter',
  params: {
    amount: { type: 'number', default: 0.35, min: 0, max: 1, step: 0.01, label: 'Amount' },
    size: { type: 'number', default: 1, min: 0.25, max: 10, step: 0.05, unit: 'px', label: 'Size' },
    seed: { type: 'seed', default: 1 },
    ...AREA,
  },
  apply: same,
  filter: (p, io, place) => {
    const { input, id } = io;
    return withArea(p, place, io, (out) =>
      `<feTurbulence type="fractalNoise" baseFrequency="${n(0.9 / Math.max(0.25, p.size))}" numOctaves="2" seed="${Math.round(p.seed)}" result="${id}-n"/>` +
      // Grey and opaque (the noise brings its own transparency, which would darken the blend).
      `<feColorMatrix in="${id}-n" type="matrix" values="0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 0 0 0 0 1" result="${id}-g"/>` +
      // The noise's grey centred on 0: lightens and darkens equally.
      `<feComposite in="${input}" in2="${id}-g" operator="arithmetic" k1="0" k2="1" k3="${n(p.amount)}" k4="${n(-p.amount / 2)}" result="${id}-m"/>` +
      `<feComposite in="${id}-m" in2="${input}" operator="in" result="${out}"/>`,
    );
  },
});

/** Displacement: the edges tremble or ripple with organic noise. Animate Amount or the seed. */
export const displace = defineModifier({
  type: 'displace',
  label: 'Displace',
  kind: 'filter',
  params: {
    amount: { type: 'number', default: 12, min: 0, max: 200, step: 0.5, unit: 'px', label: 'Amount' },
    scale: { type: 'number', default: 40, min: 2, max: 500, step: 1, unit: 'px', label: 'Scale' },
    detail: { type: 'number', default: 2, min: 1, max: 6, step: 1, label: 'Detail', ramp: false },
    seed: { type: 'seed', default: 1 },
    ...AREA,
  },
  apply: same,
  filter: (p, io, place) =>
    withArea(p, place, io, (out) =>
      `<feTurbulence type="fractalNoise" baseFrequency="${n(1 / Math.max(2, p.scale))}" numOctaves="${Math.round(p.detail)}" seed="${Math.round(p.seed)}" result="${io.id}-n"/>` +
      `<feDisplacementMap in="${io.input}" in2="${io.id}-n" scale="${n(p.amount)}" xChannelSelector="R" yChannelSelector="G" result="${out}"/>`,
    ),
  filterPad: (p) => p.amount / 2 + 2,
});

/** A colour as [r, g, b] from 0 to 1 (black if not understood). */
const rgb01 = (c: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return [0, 0, 0];
  const h = m[1]!.length === 3 ? [...m[1]!].map((x) => x + x).join('') : m[1]!;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
};

/**
 * Relief (bevel): light and shade on the edges, as if the drawing had volume. The light comes from `angle`
 * (0, the right; -135, top left) at its `elevation`; `depth`, the bevel width (px); `height`, how much it
 * stands out; `strength`, how visible it is; `shine`, the highlight and `shininess`, how concentrated.
 */
export const bevel = defineModifier({
  type: 'bevel',
  label: 'Bevel',
  kind: 'filter',
  params: {
    depth: { type: 'number', default: 4, min: 0.5, max: 60, step: 0.5, unit: 'px', label: 'Depth' },
    height: { type: 'number', default: 3, min: 0, max: 20, step: 0.1, label: 'Height' },
    angle: { type: 'angle', default: -135, label: 'Light', ramp: false },
    elevation: { type: 'number', default: 45, min: 5, max: 85, step: 1, unit: '°', label: 'Elevation', ramp: false },
    strength: { type: 'number', default: 0.8, min: 0, max: 1, step: 0.01, label: 'Strength' },
    shine: { type: 'number', default: 0.5, min: 0, max: 2, step: 0.01, label: 'Shine' },
    shininess: { type: 'number', default: 20, min: 1, max: 128, step: 1, label: 'Shininess', ramp: false },
  },
  apply: same,
  filter: (p, { input, out, id }) => {
    const az = ((p.angle % 360) + 360) % 360;
    const light = `<feDistantLight azimuth="${n(az)}" elevation="${n(p.elevation)}"/>`;
    // Flat areas, with the light in front, would come out darker (sine of the elevation): compensated.
    const k = p.strength / Math.max(0.05, Math.sin((p.elevation * Math.PI) / 180));
    return (
      `<feGaussianBlur in="SourceAlpha" stdDeviation="${n(Math.max(0.25, p.depth) / 2)}" result="${id}-h"/>` +
      `<feDiffuseLighting in="${id}-h" surfaceScale="${n(p.height)}" diffuseConstant="1" lighting-color="#fff" result="${id}-d">${light}</feDiffuseLighting>` +
      `<feSpecularLighting in="${id}-h" surfaceScale="${n(p.height)}" specularConstant="1" specularExponent="${n(Math.max(1, Math.min(128, p.shininess)))}" lighting-color="#fff" result="${id}-s">${light}</feSpecularLighting>` +
      `<feComposite in="${input}" in2="${id}-d" operator="arithmetic" k1="${n(k)}" k2="${n(1 - p.strength)}" k3="0" k4="0" result="${id}-l"/>` +
      `<feComposite in="${id}-s" in2="SourceAlpha" operator="in" result="${id}-si"/>` +
      `<feComposite in="${id}-l" in2="${id}-si" operator="arithmetic" k1="0" k2="1" k3="${n(p.shine)}" k4="0" result="${id}-x"/>` +
      `<feComposite in="${id}-x" in2="${input}" operator="in" result="${out}"/>`
    );
  },
});

/**
 * Makes the drawing thicker or thinner (`amount` px; negative, thinner), or a coloured outline around it, like
 * a sticker (`outline`). Done by the browser on what is painted: works for text, strokes and anything else.
 */
export const thicken = defineModifier({
  type: 'thicken',
  label: 'Thicken',
  kind: 'filter',
  params: {
    mode: { type: 'enum', default: 'grow', options: ['grow', 'outline'] as const, label: 'Mode', animatable: false },
    amount: { type: 'number', default: 3, min: -40, max: 40, step: 0.5, unit: 'px', label: 'Amount' },
    color: { type: 'color', default: '#ffffff', label: 'Color', showIf: { mode: ['outline'] } },
  },
  apply: same,
  filter: (p, { input, out, id }) => {
    const r = Math.abs(p.amount);
    if (p.mode === 'outline') {
      if (p.amount <= 0) return `<feMerge result="${out}"><feMergeNode in="${input}"/></feMerge>`;
      return (
        `<feMorphology in="SourceAlpha" operator="dilate" radius="${n(r)}" result="${id}-d"/>` +
        `<feFlood flood-color="${esc(p.color)}"/>` +
        `<feComposite in2="${id}-d" operator="in" result="${id}-o"/>` +
        `<feMerge result="${out}"><feMergeNode in="${id}-o"/><feMergeNode in="${input}"/></feMerge>`
      );
    }
    return `<feMorphology in="${input}" operator="${p.amount < 0 ? 'erode' : 'dilate'}" radius="${n(r)}" result="${out}"/>`;
  },
  filterPad: (p) => Math.max(0, p.amount) + 2,
});

/**
 * Tone: posterize (few levels per channel, like a poster), duotone (shadows in one colour and lights in
 * another) or invert the colours. Whole or only in an area.
 */
export const tone = defineModifier({
  type: 'tone',
  label: 'Tone',
  kind: 'filter',
  params: {
    mode: { type: 'enum', default: 'posterize', options: ['posterize', 'duotone', 'invert'] as const, label: 'Mode', animatable: false },
    levels: { type: 'number', default: 4, min: 2, max: 16, step: 1, label: 'Levels', ramp: false, showIf: { mode: ['posterize'] } },
    dark: { type: 'color', default: '#1b1464', label: 'Shadows', showIf: { mode: ['duotone'] } },
    light: { type: 'color', default: '#ff4fa3', label: 'Lights', showIf: { mode: ['duotone'] } },
    ...AREA,
  },
  apply: same,
  filter: (p, io, place) =>
    withArea(p, place, io, (out) => {
      const { input, id } = io;
      if (p.mode === 'invert')
        return `<feComponentTransfer in="${input}" result="${out}"><feFuncR type="table" tableValues="1 0"/><feFuncG type="table" tableValues="1 0"/><feFuncB type="table" tableValues="1 0"/></feComponentTransfer>`;
      if (p.mode === 'duotone') {
        const [a, b] = [rgb01(p.dark), rgb01(p.light)];
        const f = (c: string, i: number) => `<feFunc${c} type="table" tableValues="${n(a[i]!)} ${n(b[i]!)}"/>`;
        return (
          `<feColorMatrix in="${input}" type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0" result="${id}-g"/>` +
          `<feComponentTransfer in="${id}-g" result="${out}">${f('R', 0)}${f('G', 1)}${f('B', 2)}</feComponentTransfer>`
        );
      }
      const k = Math.max(2, Math.min(16, Math.round(p.levels)));
      const table = Array.from({ length: k }, (_, i) => n(i / (k - 1))).join(' ');
      return `<feComponentTransfer in="${input}" result="${out}"><feFuncR type="discrete" tableValues="${table}"/><feFuncG type="discrete" tableValues="${table}"/><feFuncB type="discrete" tableValues="${table}"/></feComponentTransfer>`;
    }),
});
