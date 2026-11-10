// Contrato de un modificador y su esquema de parámetros.
// El esquema es la fuente de verdad: genera la UI, valida el JSON y dirá qué se puede animar.

import type { Bounds, Geometry } from './geometry';

interface ParamBase {
  label?: string;
  /** Pareja que se puede enlazar en el panel (ancho ↔ alto): con el candado, cambian en proporción. */
  pair?: string;
  /** Para puntos: X e Y se pueden enlazar (en proporción). */
  linkable?: boolean;
  /** Se podrá animar en la línea de tiempo (fase 2). Por defecto, sí. */
  animatable?: boolean;
  /** Sección del panel de atributos donde aparece. Sin grupo: la sección principal. */
  group?: string;
  /** Dentro de Step, ¿crece con cada copia? Por defecto, los números y ángulos sí. */
  ramp?: boolean;
  /** Valor «sin efecto» desde el que crece (por defecto 0; la escala, 1). */
  neutral?: number;
  /** Un punto que es un lugar del dibujo se puede arrastrar en el lienzo. Por defecto, sí. */
  handle?: boolean;
  /** Rango para el dado (aleatorio). false: el dado no lo toca. Sin rango: el de min/max o uno razonable. */
  random?: [number, number] | false;
  /** Para puntos: el rango aleatorio se suma al valor por defecto (mover un poco), no lo sustituye. */
  randomRelative?: boolean;
}

export type ParamSpec =
  | (ParamBase & { type: 'number'; default: number; min?: number; max?: number; step?: number; unit?: string })
  | (ParamBase & { type: 'angle'; default: number })
  | (ParamBase & { type: 'point'; default: [number, number]; unit?: 'fraction' })
  | (ParamBase & { type: 'seed'; default: number })
  | (ParamBase & { type: 'boolean'; default: boolean })
  | (ParamBase & { type: 'color'; default: string })
  | (ParamBase & { type: 'enum'; default: string; options: readonly string[] })
  /** Otro nodo de la escena (su id); vacío = ninguno. */
  | (ParamBase & { type: 'node'; default: string });

export type ParamSchema = Record<string, ParamSpec>;

type ValueOf<S extends ParamSpec> = S['default'];
export type ParamValues<P extends ParamSchema> = { [K in keyof P]: ValueOf<P[K]> };

export interface ResolvedModifier {
  def: ModifierDef<any>;
  params: Record<string, unknown>;
  enabled: boolean;
  children: ResolvedModifier[];
}

export interface ModifierContext {
  /** Caja del SVG de origen: referencia estable para los parámetros relativos (fracciones). */
  bounds: Bounds;
  /** Longitud máxima de tramo al subdividir antes de deformar, en unidades del SVG. */
  resolution: number;
  /** Modificadores colgados de este (solo los usa Step). */
  children: ResolvedModifier[];
  /** La geometría de otro nodo (parámetros `node`), en las coordenadas de esta pila; null si no la hay (aún). */
  target?: (id: string) => Geometry | null;
}

export interface ModifierDef<P extends ParamSchema = ParamSchema> {
  type: string;
  label: string;
  kind: 'deformer' | 'generator' | 'effector' | 'style';
  params: P;
  apply(geo: Geometry, params: ParamValues<P>, ctx: ModifierContext): Geometry;
}

/** Ayuda de tipos: infiere los parámetros a partir del esquema. */
export const defineModifier = <P extends ParamSchema>(def: ModifierDef<P>): ModifierDef<P> => def;

/** Valores por defecto completados con los que vengan en la escena. */
export function resolveParams<P extends ParamSchema>(schema: P, given: Record<string, unknown> = {}): ParamValues<P> {
  const out: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(schema)) {
    const v = given[name];
    out[name] = v === undefined ? spec.default : v;
  }
  return out as ParamValues<P>;
}

/**
 * Parámetros de un modificador para la copia k (1, 2, 3…) dentro de Step:
 * los números crecen desde su valor neutro; la semilla cambia por copia; el resto, igual.
 */
export function rampParams(schema: ParamSchema, params: Record<string, unknown>, k: number): Record<string, unknown> {
  const out: Record<string, unknown> = { ...params };
  for (const [name, spec] of Object.entries(schema)) {
    const v = params[name];
    if (spec.type === 'seed' && typeof v === 'number') out[name] = v + Math.round(k) - 1;
    if ((spec.type !== 'number' && spec.type !== 'angle') || spec.ramp === false || typeof v !== 'number') continue;
    const n = spec.neutral ?? 0;
    out[name] = n + (v - n) * k;
  }
  return out;
}

/**
 * Valores aleatorios para el dado. Respeta los rangos del esquema; lo que no tiene sentido sortear
 * (colores, desplazamientos en píxeles…) se queda como está.
 */
export function randomizeParams(schema: ParamSchema, current: Record<string, unknown>, rand: () => number): Record<string, unknown> {
  const out: Record<string, unknown> = { ...current };
  const between = (a: number, b: number) => a + (b - a) * rand();
  const snap = (v: number, step?: number) => (step ? Math.round(v / step) * step : v);
  const round = (v: number, step?: number) => Number(snap(v, step).toFixed(step && step < 1 ? String(step).split('.')[1]!.length : 3));
  for (const [name, spec] of Object.entries(schema)) {
    if (spec.random === false) continue;
    switch (spec.type) {
      case 'number': {
        const [a, b] = spec.random ?? (spec.min !== undefined && spec.max !== undefined ? [spec.min, spec.max] : null) ?? [null, null];
        if (a === null || b === null) break;
        out[name] = round(between(a, b), spec.step);
        break;
      }
      case 'angle': {
        const [a, b] = spec.random ?? [-90, 90];
        out[name] = Math.round(between(a, b));
        break;
      }
      case 'point': {
        if (spec.handle === false && !spec.random) break;
        const [a, b] = spec.random ?? [0.2, 0.8];
        const base: [number, number] = spec.randomRelative ? spec.default : [0, 0];
        out[name] = [round(base[0] + between(a, b)), round(base[1] + between(a, b))];
        break;
      }
      case 'seed':
        out[name] = 1 + Math.floor(rand() * 9999);
        break;
      case 'enum':
        if (spec.animatable === false && spec.random === undefined) break; // ejes y modos: decisión del usuario
        out[name] = spec.options[Math.floor(rand() * spec.options.length)];
        break;
      case 'boolean':
      case 'color':
      case 'node':
        break;
    }
  }
  return out;
}

/** Fracción de la caja de origen → coordenadas del SVG. */
export const fromFraction = (b: Bounds, [fx, fy]: readonly [number, number]): [number, number] => [
  b.x + fx * b.width,
  b.y + fy * b.height,
];

export const deg = (a: number) => (a * Math.PI) / 180;
