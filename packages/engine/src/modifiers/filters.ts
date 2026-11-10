// Filtros de SVG: no cambian la geometría; se aplican al objeto entero al pintarlo (sombra, desenfoque,
// resplandor, grano, desplazamiento). Los calcula el navegador: baratos de ajustar, pero un desenfoque
// grande o animado cuesta al pintar, sobre todo en el móvil. Unidades: las del documento (px).
import type { Geometry } from '../geometry';
import { defineModifier, type FilterPlace, type ParamSpec } from '../modifier';

const same = (geo: Geometry) => geo;
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const n = (v: number) => String(Math.round(v * 1000) / 1000);

// ── Zona: el filtro entero, o solo en un círculo o en una franja (con su paso suave al original).
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
 * El efecto (que escribe en `<id>-e`) solo donde dice la zona: una máscara con un degradado (radial, o una
 * franja), dentro del propio filtro como imagen; donde es opaca, el efecto; donde no, el original.
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
    // Franja a lo largo de `angle` (más el giro del objeto); su ancho, 2 × radio.
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

/** Sombra: una copia desenfocada y desplazada, de un color, detrás. */
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

/** Desenfoque: en las dos direcciones, o solo en una (sensación de movimiento); entero o solo en una zona. */
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

/** Resplandor: un halo de color alrededor (por detrás del dibujo). */
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
    // Más de 1: el halo se suma a sí mismo (más intenso, sin crecer).
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

/** Grano: ruido fino sobre el dibujo (solo dentro de él), como de película o de impresión. */
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
      // En gris y opaco (el ruido trae su propia transparencia, que oscurecería la mezcla).
      `<feColorMatrix in="${id}-n" type="matrix" values="0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 0 0 0 0 1" result="${id}-g"/>` +
      // Gris del ruido centrado en 0: aclara y oscurece por igual.
      `<feComposite in="${input}" in2="${id}-g" operator="arithmetic" k1="0" k2="1" k3="${n(p.amount)}" k4="${n(-p.amount / 2)}" result="${id}-m"/>` +
      `<feComposite in="${id}-m" in2="${input}" operator="in" result="${out}"/>`,
    );
  },
});

/** Desplazamiento: los bordes tiemblan u ondulan con un ruido orgánico. Anima Amount o la semilla. */
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
