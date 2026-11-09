// Contrato de un modificador y su esquema de parámetros.
// El esquema es la fuente de verdad: genera la UI, valida el JSON y dirá qué se puede animar.

import type { Bounds, Geometry } from './geometry';

interface ParamBase {
  label?: string;
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
}

export type ParamSpec =
  | (ParamBase & { type: 'number'; default: number; min?: number; max?: number; step?: number; unit?: string })
  | (ParamBase & { type: 'angle'; default: number })
  | (ParamBase & { type: 'point'; default: [number, number]; unit?: 'fraction' })
  | (ParamBase & { type: 'seed'; default: number })
  | (ParamBase & { type: 'boolean'; default: boolean })
  | (ParamBase & { type: 'color'; default: string })
  | (ParamBase & { type: 'enum'; default: string; options: readonly string[] });

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
}

export interface ModifierDef<P extends ParamSchema = ParamSchema> {
  type: string;
  label: string;
  kind: 'deformer' | 'generator' | 'effector';
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

/** Fracción de la caja de origen → coordenadas del SVG. */
export const fromFraction = (b: Bounds, [fx, fy]: readonly [number, number]): [number, number] => [
  b.x + fx * b.width,
  b.y + fy * b.height,
];

export const deg = (a: number) => (a * Math.PI) / 180;
