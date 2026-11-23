// Logic for dragging numeric values, without the DOM.

export interface ScrubOptions {
  step: number;
  min?: number;
  max?: number;
  /** Drag pixels per `step`. */
  pixelsPerStep?: number;
  /** Shift: steps ×10. */
  coarse?: boolean;
  /** Alt: pasos ×0,1. */
  fine?: boolean;
}

export const clamp = (v: number, min = -Infinity, max = Infinity) => Math.min(max, Math.max(min, v));

/** Decimals `step` has (0.01 → 2), to avoid dragging floating-point noise. */
export const decimalsOf = (step: number) => {
  if (!Number.isFinite(step) || Number.isInteger(step)) return 0;
  const s = String(step);
  const e = s.indexOf('e-');
  if (e >= 0) return Number(s.slice(e + 2));
  return s.split('.')[1]?.length ?? 0;
};

/** Starting value + horizontal offset in pixels → new value rounded to the step. */
export function scrub(start: number, dx: number, o: ScrubOptions): number {
  const mult = o.coarse ? 10 : o.fine ? 0.1 : 1;
  const step = o.step * mult;
  const steps = Math.round(dx / (o.pixelsPerStep ?? 2));
  const v = clamp(start + steps * step, o.min, o.max);
  return Number(v.toFixed(decimalsOf(step)));
}

/** Text typed by the user → a valid number, or null. Accepts a decimal comma. */
export function parseNumber(text: string): number | null {
  const v = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(v) ? v : null;
}

// A value that is not a number (not arrived yet) shows empty instead of breaking the panel.
export const formatNumber = (v: number, step: number) => (Number.isFinite(v) ? v.toFixed(decimalsOf(step)) : "");

/** One step up or down (keyboard arrows), rounded to the step. */
export function nudge(value: number, direction: 1 | -1, o: ScrubOptions): number {
  const step = o.step * (o.coarse ? 10 : o.fine ? 0.1 : 1);
  const v = clamp(value + direction * step, o.min, o.max);
  return Number(v.toFixed(Math.max(decimalsOf(step), decimalsOf(o.step))));
}
