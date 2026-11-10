// Alinear y distribuir: a partir de las cajas (en el documento) de los nodos, cuánto mover cada uno.
import type { Bounds } from '@svertik/engine';

export type Align = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export interface Item { id: string; box: Bounds }
export interface Move { id: string; dx: number; dy: number }

const union = (items: Item[]): Bounds => {
  const x0 = Math.min(...items.map((i) => i.box.x));
  const y0 = Math.min(...items.map((i) => i.box.y));
  const x1 = Math.max(...items.map((i) => i.box.x + i.box.width));
  const y1 = Math.max(...items.map((i) => i.box.y + i.box.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};

/** Alinea con la caja que los contiene a todos («alinear a la selección»). */
export function align(items: Item[], how: Align): Move[] {
  if (items.length < 2) return [];
  const u = union(items);
  return items.map(({ id, box: b }) => {
    const dx =
      how === 'left' ? u.x - b.x : how === 'right' ? u.x + u.width - (b.x + b.width) : how === 'hcenter' ? u.x + u.width / 2 - (b.x + b.width / 2) : 0;
    const dy =
      how === 'top' ? u.y - b.y : how === 'bottom' ? u.y + u.height - (b.y + b.height) : how === 'vcenter' ? u.y + u.height / 2 - (b.y + b.height / 2) : 0;
    return { id, dx: dx || 0, dy: dy || 0 };
  });
}

/** Reparte con huecos iguales entre cajas; el primero y el último (por posición) se quedan donde están. */
export function distribute(items: Item[], axis: 'x' | 'y'): Move[] {
  if (items.length < 3) return [];
  const pos = (b: Bounds) => (axis === 'x' ? b.x : b.y);
  const size = (b: Bounds) => (axis === 'x' ? b.width : b.height);
  const sorted = [...items].sort((a, b) => pos(a.box) + size(a.box) / 2 - (pos(b.box) + size(b.box) / 2));
  const first = sorted[0]!.box, last = sorted[sorted.length - 1]!.box;
  const span = pos(last) + size(last) - pos(first);
  const gap = (span - sorted.reduce((s, i) => s + size(i.box), 0)) / (sorted.length - 1);
  let at = pos(first);
  return sorted.map(({ id, box }) => {
    const d = at - pos(box);
    at += size(box) + gap;
    return axis === 'x' ? { id, dx: d || 0, dy: 0 } : { id, dx: 0, dy: d || 0 };
  });
}
