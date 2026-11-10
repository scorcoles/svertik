// Filtros encadenados: los de una pila (o los que van dentro de RGB Split), en orden, cada uno leyendo lo
// que dejó el anterior. Las primitivas se escriben cuando se sabe dónde está el objeto (`place`).
import type { FilterPlace, ModifierDef } from './modifier';

export interface FilterChain {
  /** Cuánto se salen en total de la caja del objeto, en unidades del documento. */
  pad: number;
  markup(id: string, place: FilterPlace): string;
}

/** La cadena de una lista de filtros (con sus parámetros ya resueltos), o null si no hay ninguno. */
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
