// El importador de SVG, aparte.
//
// El módulo que sabe leer un SVG (`./import`) pesa (trazado de rutas, DOM). El núcleo del motor no lo
// necesita para siempre: solo cuando una escena trae el marcado de un SVG sin empaquetar. Por eso el
// importador se registra aquí y el núcleo llama a `importSVG`, que avisa si nadie lo ha registrado.
//
// Así el reproductor mínimo («player») no carga el lector de SVG hasta que la escena lo pide.

import type { Geometry } from './geometry';

/** Convierte el marcado de un SVG en geometría. */
export type SVGImporter = (source: string) => Geometry;

let importer: SVGImporter | null = null;

/** Registra quién sabe leer SVG (lo hace `./import` al cargarse). */
export function setSVGImporter(fn: SVGImporter): void {
  importer = fn;
}

/** ¿Hay ya alguien que sepa leer SVG? */
export function hasSVGImporter(): boolean {
  return importer !== null;
}

/** SVG (texto) → geometría. Sin importador registrado, avisa con lo que hay que hacer. */
export function importSVG(source: string): Geometry {
  if (!importer) {
    throw new Error('svertik: esta escena trae SVG sin empaquetar y el importador no está cargado (importa «@svertik/engine/import»)');
  }
  return importer(source);
}
