// Contrato de un modificador y su esquema de parámetros.
// El esquema es la fuente de verdad: genera la UI, valida el JSON y dirá qué se puede animar.

import type { Bounds, Geometry } from './geometry';

interface ParamBase {
  label?: string;
  /** Se podrá animar en la línea de tiempo (fase 2). Por defecto, sí. */
  animatable?: boolean;
}

export type ParamSpec =
  | (ParamBase & { type: 'number'; default: number; min?: number; max?: number; step?: number; unit?: string })
  | (ParamBase & { type: 'angle'; default: number })
  | (ParamBase & { type: 'point'; default: [number, number]; unit?: 'fraction' })
  | (ParamBase & { type: 'seed'; default: number })
  | (ParamBase & { type: 'boolean'; default: boolean })
  | (ParamBase & { type: 'enum'; default: string; options: readonly string[] });

export type ParamSchema = Record<string, ParamSpec>;

type ValueOf<S extends ParamSpec> = S['default'];
export type ParamValues<P extends ParamSchema> = { [K in keyof P]: ValueOf<P[K]> };

export interface ModifierContext {
  /** Caja del SVG de origen: referencia estable para los parámetros relativos (fracciones). */
  bounds: Bounds;
  /** Longitud máxima de tramo al subdividir antes de deformar, en unidades del SVG. */
  resolution: number;
}

export interface ModifierDef<P extends ParamSchema = ParamSchema> {
  type: string;
  label: string;
  kind: 'deformer' | 'generator';
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

/** Fracción de la caja de origen → coordenadas del SVG. */
export const fromFraction = (b: Bounds, [fx, fy]: readonly [number, number]): [number, number] => [
  b.x + fx * b.width,
  b.y + fy * b.height,
];

export const deg = (a: number) => (a * Math.PI) / 180;
