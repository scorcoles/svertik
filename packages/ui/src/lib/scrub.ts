// Lógica del arrastre de valores numéricos, sin DOM.

export interface ScrubOptions {
  step: number;
  min?: number;
  max?: number;
  /** Píxeles de arrastre por cada `step`. */
  pixelsPerStep?: number;
  /** Mayúsculas: pasos ×10. */
  coarse?: boolean;
  /** Alt: pasos ×0,1. */
  fine?: boolean;
}

export const clamp = (v: number, min = -Infinity, max = Infinity) => Math.min(max, Math.max(min, v));

/** Decimales que tiene `step` (0.01 → 2), para no arrastrar basura de coma flotante. */
export const decimalsOf = (step: number) => {
  if (!Number.isFinite(step) || Number.isInteger(step)) return 0;
  const s = String(step);
  const e = s.indexOf('e-');
  if (e >= 0) return Number(s.slice(e + 2));
  return s.split('.')[1]?.length ?? 0;
};

/** Valor de partida + desplazamiento horizontal en píxeles → nuevo valor redondeado al paso. */
export function scrub(start: number, dx: number, o: ScrubOptions): number {
  const mult = o.coarse ? 10 : o.fine ? 0.1 : 1;
  const step = o.step * mult;
  const steps = Math.round(dx / (o.pixelsPerStep ?? 2));
  const v = clamp(start + steps * step, o.min, o.max);
  return Number(v.toFixed(decimalsOf(step)));
}

/** Texto escrito por el usuario → número válido, o null. Acepta coma decimal. */
export function parseNumber(text: string): number | null {
  const v = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(v) ? v : null;
}

export const formatNumber = (v: number, step: number) => v.toFixed(decimalsOf(step));

/** Un paso arriba o abajo (flechas del teclado), redondeado al paso. */
export function nudge(value: number, direction: 1 | -1, o: ScrubOptions): number {
  const step = o.step * (o.coarse ? 10 : o.fine ? 0.1 : 1);
  const v = clamp(value + direction * step, o.min, o.max);
  return Number(v.toFixed(Math.max(decimalsOf(step), decimalsOf(o.step))));
}
