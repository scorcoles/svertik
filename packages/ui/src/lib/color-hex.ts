// Hex colours with optional alpha for the colour fields: #rgb, #rgba, #rrggbb and #rrggbbaa.

/** A typed hex colour: with alpha (4 or 8 digits) only when `alpha` is allowed. */
export const hexPattern = (alpha = true) =>
  alpha ? /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i : /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** RGB as #rrggbb and alpha from 0 to 1 (opaque black if not understood). */
export function splitHex(value: string): { rgb: string; a: number } {
  const m = /^#?([0-9a-f]{3,8})$/i.exec((value ?? '').trim());
  let h = m?.[1] ?? '';
  if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
  if (h.length !== 6 && h.length !== 8) return { rgb: '#000000', a: 1 };
  return { rgb: `#${h.slice(0, 6).toLowerCase()}`, a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
}

/** #rrggbb, or #rrggbbaa when the alpha is below 1. */
export function joinHex(rgb: string, a: number): string {
  const base = splitHex(rgb).rgb;
  const byte = Math.round(Math.max(0, Math.min(1, a)) * 255);
  return byte >= 255 ? base : `${base}${byte.toString(16).padStart(2, '0')}`;
}

/** A typed colour, normalised: lowercase, long form, the alpha dropped when opaque or not allowed. */
export function normalizeTyped(value: string, alpha = true): string {
  const { rgb, a } = splitHex(value);
  return alpha ? joinHex(rgb, a) : rgb;
}

/** CSS background for a swatch: the colour over a checkerboard, so transparency shows. */
export const swatchBackground = (color: string) =>
  `linear-gradient(${color}, ${color}), repeating-conic-gradient(#c8c8c8 0 25%, #ffffff 0 50%) 0 0 / 6px 6px`;
