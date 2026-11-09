// La escena (lo que se guarda y se exporta como JSON) y el motor que la evalúa.

import { bounds, type Geometry } from './geometry';
import { importSVG } from './import';
import { resolveParams, type ModifierContext, type ModifierDef, type ResolvedModifier } from './modifier';
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
 * Escena v1: un SVG de origen y una pila lineal de modificadores.
 * (Cuando haya varios objetos, `stack` pasará a vivir dentro de cada objeto.)
 */
export interface Scene {
  version: 1;
  source: string;
  stack: ModifierInstance[];
  /** Longitud máxima de tramo al subdividir, como fracción del tamaño del dibujo. */
  resolution?: number;
}

export interface Engine {
  /** Evalúa la escena; reutiliza lo calculado si el principio de la pila no ha cambiado. */
  evaluate(scene: Scene): Geometry;
  /** Resultado de cada paso de la pila: [origen, tras el 1.º, tras el 2.º, …]. */
  evaluateSteps(scene: Scene): Geometry[];
  toSVG(scene: Scene, options?: ToSVGOptions): string;
  /** Pinta la escena en un <svg> y devuelve con qué actualizarla. */
  mount(svg: SVGSVGElement, scene: Scene, options?: ToSVGOptions): { update(scene: Scene): void };
}

const DEFAULT_RESOLUTION = 0.01;

export function createEngine(modifiers: readonly ModifierDef<any>[]): Engine {
  const registry = new Map(modifiers.map((m) => [m.type, m]));

  // Caché: el origen importado y el resultado de cada paso, con la clave que lo produjo.
  let sourceKey: string | null = null;
  let sourceGeo: Geometry | null = null;
  let steps: { key: string; geo: Geometry }[] = [];

  function load(scene: Scene): Geometry {
    const key = `${scene.resolution ?? DEFAULT_RESOLUTION}\n${scene.source}`;
    if (key !== sourceKey || !sourceGeo) {
      sourceGeo = importSVG(scene.source);
      sourceKey = key;
      steps = [];
    }
    return sourceGeo;
  }

  function evaluateSteps(scene: Scene): Geometry[] {
    const source = load(scene);
    const b = bounds(source);
    const ctx: ModifierContext = {
      bounds: b,
      resolution: Math.max(b.width, b.height) * (scene.resolution ?? DEFAULT_RESOLUTION) || 1,
      children: [],
    };
    const out: Geometry[] = [source];
    let geo = source;
    let reusable = true;
    scene.stack.forEach((inst, i) => {
      const key = JSON.stringify([inst.type, inst.enabled ?? true, inst.params ?? {}, inst.children ?? []]);
      const cached = steps[i];
      if (reusable && cached && cached.key === key) {
        geo = cached.geo;
      } else {
        reusable = false;
        const def = registry.get(inst.type);
        if (!def) throw new Error(`svertik: modificador desconocido «${inst.type}»`);
        if (inst.enabled !== false) geo = def.apply(geo, resolveParams(def.params, inst.params), { ...ctx, children: resolveChildren(inst.children) });
        steps[i] = { key, geo };
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

  const evaluate = (scene: Scene) => evaluateSteps(scene).at(-1)!;

  return {
    evaluate,
    evaluateSteps,
    toSVG: (scene, options) => toSVG(evaluate(scene), options),
    mount(svg, scene, options) {
      renderInto(svg, evaluate(scene), options);
      return { update: (next) => renderInto(svg, evaluate(next), options) };
    },
  };
}
