// Chained filters: those of a stack (or those inside RGB Split), in order, each one reading what the
// previous one left. The primitives are written once it is known where the object is (`place`).
import type { FilterPlace, ModifierDef } from './modifier';

export interface FilterChain {
  /** How far they reach beyond the object's box in total, in document units. */
  pad: number;
  markup(id: string, place: FilterPlace): string;
}

/** The chain of a list of filters (with their parameters resolved), or null if there are none. */
export function chainFrom(list: { def: ModifierDef<any>; params: Record<string, unknown> }[]): FilterChain | null {
  const filters = list.filter((f) => f.def.kind === 'filter' && f.def.filter);
  if (!filters.length) return null;
  return {
    pad: filters.reduce((sum, f) => sum + (f.def.filterPad?.(f.params as never) ?? 0), 0),
    markup(id, place) {
      let input = 'SourceGraphic';
      return filters
        .map((f, n) => {
          const out = `f${n}`;
          const m = f.def.filter!(f.params as never, { input, out, id: `${id}-${n}` }, place);
          input = out;
          return m;
        })
        .join('');
    },
  };
}
