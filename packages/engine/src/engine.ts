// La escena (lo que se guarda y se exporta como JSON) y el motor que la evalúa.

import { createDocumentEvaluator, type DocumentResult, type SceneV2 } from './document';
import { bounds, type Bounds, type Geometry } from './geometry';
import { importSVG } from './import';
import { resolveParams, type FilterPlace, type ModifierContext, type ModifierDef, type ResolvedModifier } from './modifier';
import { renderInto, toSVG, type ToSVGOptions } from './render';

export interface ModifierInstance {
  /** Identificador estable: servirá para referenciar pistas de animación. */
  id: string;
  type: string;
  enabled?: boolean;
  params?: Record<string, unknown>;
  /** Modificadores colgados de este (Step los aplica copia a copia). */
  children?: ModifierInstance[];
}

/**
 * Una pila de efectos sobre un SVG suelto, sin escena (para probar efectos o enseñar la cadena paso a paso).
 * El resultado queda en las coordenadas del SVG.
 */
export interface StackInput {
  source: string;
  stack: ModifierInstance[];
  /** Longitud máxima de tramo al subdividir, como fracción del tamaño del dibujo. */
  resolution?: number;
}

/** Los filtros de un objeto, encadenados (ver `ModifierDef.filter`). */
export interface FilterChain {
  pad: number;
  markup(id: string, place: FilterPlace): string;
}

export interface Engine {
  /** Aplica una pila a un SVG; reutiliza lo calculado si el principio de la pila no ha cambiado. */
  evaluateStack(input: StackInput): Geometry;
  /** El resultado de cada paso de la pila: [origen, tras el 1.º, tras el 2.º, …]. */
  evaluateStackSteps(input: StackInput): Geometry[];
  /** La escena: el documento entero, el origen colocado y la información de cada nodo. */
  evaluateDocument(scene: SceneV2): DocumentResult;
  toSVG(scene: SceneV2, options?: ToSVGOptions): string;
  /** Pinta la escena en un <svg> y devuelve con qué actualizarla. */
  mount(svg: SVGSVGElement, scene: SceneV2, options?: ToSVGOptions): { update(scene: SceneV2): void };
}

const DEFAULT_RESOLUTION = 0.01;

/** Lo que guarda `runStack` de un nodo entre evaluaciones: de qué geometría partió y el resultado de cada paso. */
export interface StepMemo {
  base?: Geometry;
  resolution?: number;
  steps: { key: string; geo: Geometry; dynamic: boolean; ref: Bounds }[];
}

/**
 * La caja sobre la que mide cada efecto de una pila (por su id): la del origen o la del último que la cambió.
 * La clave vacía ('') guarda la del final de la pila: la de los filtros, que se aplican después de todo.
 */
export type StackRefs = Record<string, Bounds>;

export function createEngine(modifiers: readonly ModifierDef<any>[]): Engine {
  const registry = new Map(modifiers.map((m) => [m.type, m]));

  // Caché: el origen importado y el resultado de cada paso, con la clave que lo produjo.
  let sourceKey: string | null = null;
  let sourceGeo: Geometry | null = null;
  let steps: { key: string; geo: Geometry; ref: Bounds }[] = [];

  function load(scene: StackInput): Geometry {
    const key = `${scene.resolution ?? DEFAULT_RESOLUTION}\n${scene.source}`;
    if (key !== sourceKey || !sourceGeo) {
      sourceGeo = importSVG(scene.source);
      sourceKey = key;
      steps = [];
    }
    return sourceGeo;
  }

  function evaluateStackSteps(scene: StackInput): Geometry[] {
    const source = load(scene);
    const b = bounds(source);
    const ctx: ModifierContext = {
      bounds: b,
      resolution: Math.max(b.width, b.height) * (scene.resolution ?? DEFAULT_RESOLUTION) || 1,
      children: [],
    };
    const out: Geometry[] = [source];
    let geo = source;
    let ref = b;
    let reusable = true;
    scene.stack.forEach((inst, i) => {
      const key = JSON.stringify([inst.type, inst.enabled ?? true, inst.params ?? {}, inst.children ?? []]);
      const cached = steps[i];
      if (reusable && cached && cached.key === key) {
        geo = cached.geo;
        ref = cached.ref;
      } else {
        reusable = false;
        const def = registry.get(inst.type);
        if (!def) throw new Error(`svertik: modificador desconocido «${inst.type}»`);
        // Los filtros no cambian la geometría (se aplican al pintar el objeto).
        if (inst.enabled !== false && def.kind !== 'filter') {
          geo = def.apply(geo, resolveParams(def.params, inst.params), { ...ctx, bounds: ref, children: resolveChildren(inst.children) });
          if (def.reframe) {
            const nb = bounds(geo);
            if (nb.width > 0 || nb.height > 0) ref = nb;
          }
        }
        steps[i] = { key, geo, ref };
      }
      out.push(geo);
    });
    steps.length = scene.stack.length;
    return out;
  }

  function resolveChildren(children: ModifierInstance[] = []): ResolvedModifier[] {
    return children.map((c) => {
      const def = registry.get(c.type);
      if (!def) throw new Error(`svertik: modificador desconocido «${c.type}»`);
      return { def, params: resolveParams(def.params, c.params), enabled: c.enabled !== false, children: resolveChildren(c.children) };
    });
  }

  const evaluateStack = (input: StackInput) => evaluateStackSteps(input).at(-1)!;

  /**
   * Una pila aplicada a una geometría con su caja de referencia (para objetos y grupos de la v2).
   * Con `memo`, guarda el resultado de cada paso: si la geometría de partida es la misma y los primeros
   * efectos no han cambiado, se reutilizan (animar el último de la pila no rehace los de debajo).
   * Un paso que mira otro objeto no se reutiliza (puede haber cambiado el otro).
   */
  function runStack(geo: Geometry, stack: ModifierInstance[], ref: Bounds, resolution: number, target?: (id: string) => Geometry | null, memo?: StepMemo, refs?: StackRefs): Geometry {
    // La subdivisión sigue el tamaño del origen; la caja de referencia cambia tras un efecto que reencuadra.
    const res = Math.max(ref.width, ref.height) * resolution || 1;
    let reuse = !!memo && memo.base === geo && memo.resolution === resolution;
    if (memo && !reuse) Object.assign(memo, { base: geo, resolution, steps: [] });
    stack.forEach((inst, i) => {
      if (refs) refs[inst.id] = ref;
      const key = JSON.stringify([inst.type, inst.enabled ?? true, inst.params ?? {}, inst.children ?? []]);
      const cached = memo?.steps[i];
      if (reuse && cached && cached.key === key && !cached.dynamic) {
        geo = cached.geo;
        ref = cached.ref;
        return;
      }
      reuse = false;
      let dynamic = false;
      const look = target && ((id: string) => ((dynamic = true), target(id)));
      if (inst.enabled !== false) {
        const def = registry.get(inst.type);
        if (!def) throw new Error(`svertik: modificador desconocido «${inst.type}»`);
        if (def.kind !== 'filter') {
          geo = def.apply(geo, resolveParams(def.params, inst.params), { bounds: ref, resolution: res, target: look, children: resolveChildren(inst.children) });
          if (def.reframe) {
            const b = bounds(geo);
            if (b.width > 0 || b.height > 0) ref = b;
          }
        }
      }
      if (memo) memo.steps[i] = { key, geo, dynamic, ref };
    });
    if (memo) memo.steps.length = stack.length;
    if (refs) refs[''] = ref;
    return geo;
  }
  /**
   * Los filtros de una pila (los activos, en orden): cuánto se salen en total y cómo escribir sus
   * primitivas encadenadas cuando se sepa dónde está el objeto.
   */
  function filtersOf(stack: ModifierInstance[]): FilterChain | null {
    const list = stack.flatMap((inst) => {
      const def = registry.get(inst.type);
      return inst.enabled !== false && def?.kind === 'filter' && def.filter ? [{ def, params: resolveParams(def.params, inst.params) }] : [];
    });
    if (!list.length) return null;
    return {
      pad: list.reduce((sum, f) => sum + (f.def.filterPad?.(f.params) ?? 0), 0),
      markup(id, place) {
        let input = 'SourceGraphic';
        return list
          .map((f, n) => {
            const out = `f${n}`;
            const m = f.def.filter!(f.params, { input, out, id: `${id}-${n}` }, place);
            input = out;
            return m;
          })
          .join('');
      },
    };
  }
  const documents = createDocumentEvaluator(runStack, filtersOf);
  const evaluateDocument = (scene: SceneV2) => documents.evaluate(scene);
  const flat = (scene: SceneV2) => evaluateDocument(scene).geometry;

  return {
    evaluateStack,
    evaluateStackSteps,
    evaluateDocument,
    toSVG: (scene, options) => toSVG(flat(scene), options),
    mount(svg, scene, options) {
      renderInto(svg, flat(scene), options);
      return { update: (next) => renderInto(svg, flat(next), options) };
    },
  };
}
