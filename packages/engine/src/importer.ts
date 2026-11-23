// The SVG importer, kept apart.
//
// The module that reads SVG (`./import`) is heavy (path parsing, DOM). The engine core does not
// always need it: only when a scene carries unpacked SVG markup. So the importer registers
// itself here and the core calls `importSVG`, which complains if nothing registered it.
//
// That way the player does not load the SVG reader until a scene asks for it.

import type { Geometry } from './geometry';

/** Turns SVG markup into geometry. */
export type SVGImporter = (source: string) => Geometry;

let importer: SVGImporter | null = null;

/** Registers the SVG reader (`./import` does it when it loads). */
export function setSVGImporter(fn: SVGImporter): void {
  importer = fn;
}

/** Is there an SVG reader yet? */
export function hasSVGImporter(): boolean {
  return importer !== null;
}

/** SVG (text) → geometry. Without a registered importer, it says what to do. */
export function importSVG(source: string): Geometry {
  if (!importer) {
    throw new Error('svertik: this scene has unpacked SVG and the SVG importer is not loaded (import "@svertik/engine/import")');
  }
  return importer(source);
}
