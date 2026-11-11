// What a scene needs before it can be played: only its effects, and only the heavy parts (the SVG
// importer, the fonts) if it really uses them.
//
// This is what makes the minimal player small: the scene's JSON says which effects it uses, and each
// one is a chunk of its own that is only downloaded when the scene asks for it.

import { loadFonts, type SceneNode, type SceneV2 } from './document';
import { setSVGImporter } from './importer';
import { effectLoaders } from './modifiers/manifest';
import type { ModifierDef } from './modifier';
import type { ModifierInstance } from './engine';

/** The types of the effects of a stack (and of the ones nested in them). */
function stackTypes(stack: ModifierInstance[], out: Set<string>): void {
  for (const m of stack) {
    out.add(m.type);
    if (m.children) stackTypes(m.children, out);
  }
}

/** Every effect type the scene uses. */
export function sceneEffectTypes(scene: SceneV2): string[] {
  const out = new Set<string>();
  const walk = (nodes: SceneNode[]) => {
    for (const node of nodes) {
      stackTypes(node.stack, out);
      if (node.kind === 'group') walk(node.children);
      // A pack can keep the original node (to be able to unpack it): its effects count too.
      const packed = node.kind === 'object' ? node.packed : undefined;
      if (packed?.original) walk([packed.original]);
    }
  };
  walk(scene.objects);
  return [...out];
}

/** Does the scene have text? (then it needs a font, and opentype.js with it) */
export function sceneHasText(scene: SceneV2): boolean {
  const walk = (nodes: SceneNode[]): boolean =>
    nodes.some((node) => (node.kind === 'shape' && node.shape === 'text') || (node.kind === 'group' && walk(node.children)));
  return walk(scene.objects);
}

/** Does the scene bring the markup of an SVG? (then it needs the importer) */
export function sceneNeedsImporter(scene: SceneV2): boolean {
  const walk = (nodes: SceneNode[]): boolean =>
    nodes.some((node) => (node.kind === 'object' && !node.packed) || (node.kind === 'group' && walk(node.children)));
  return walk(scene.objects);
}

/**
 * Loads what the scene needs and returns the effects to build the engine with.
 * Throws if the scene asks for an effect that doesn't exist.
 */
export async function prepareScene(scene: SceneV2): Promise<ModifierDef<any>[]> {
  const types = sceneEffectTypes(scene);
  const unknown = types.filter((t) => !effectLoaders[t]);
  if (unknown.length) throw new Error(`svertik: efectos que no existen: ${unknown.join(', ')}`);

  const defs: ModifierDef<any>[] = [];
  await Promise.all(
    types.map(async (type) => {
      defs.push(...(await effectLoaders[type]!()));
    }),
  );

  // The fonts of the texts (and, with them, opentype.js).
  if (sceneHasText(scene)) await loadFonts(scene);
  // The importer of SVG, only if the scene brings the markup of one.
  if (sceneNeedsImporter(scene)) {
    const mod = await import('./import');
    setSVGImporter(mod.parseSVG);
  }

  return defs;
}
