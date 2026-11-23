// What a scene needs before it can be played: only its effects, and only the heavy parts (the SVG
// importer, the fonts) if it really uses them.
//
// This is what makes the minimal player small: the scene's JSON says which effects it uses, and each
// one is a chunk of its own that is only downloaded when the scene asks for it.

import { loadFonts, type SceneNode, type SceneV1 } from './document';
import { setSVGImporter } from './importer';
import { initKernels } from './kernels';
import { effectLoaders } from './modifiers/manifest';
import type { ModifierDef } from './modifier';
import type { ModifierInstance } from './engine';

/** The effects that have a Rust kernel (a WebAssembly module of their own, loaded on demand). */
const kernelEffects = new Set(['metaball']);

/** The types of the effects of a stack (and of the ones nested in them). */
function stackTypes(stack: ModifierInstance[], out: Set<string>): void {
  for (const m of stack) {
    out.add(m.type);
    if (m.children) stackTypes(m.children, out);
  }
}

/** Every effect type the scene uses. */
export function sceneEffectTypes(scene: SceneV1): string[] {
  const out = new Set<string>();
  const walk = (nodes: SceneNode[]) => {
    for (const node of nodes) {
      stackTypes(node.stack ?? [], out);
      if (node.children?.length) walk(node.children);
      if (node.kind === 'group' && node.composition) { walk(node.composition.scene.objects); if (node.composition.modulation) out.add(node.composition.modulation.type); }
      // A pack can keep the original node (to be able to unpack it): its effects count too.
      const packed = node.kind === 'object' ? node.packed : undefined;
      if (packed?.original) walk([packed.original]);
    }
  };
  walk(scene.objects);
  return [...out];
}

/** Does the scene have text? (then it needs a font, and opentype.js with it) */
export function sceneHasText(scene: SceneV1): boolean {
  const walk = (nodes: SceneNode[]): boolean =>
    nodes.some((node) => (node.kind === 'shape' && node.shape === 'text') || (!!node.children?.length && walk(node.children)) || (node.kind === 'group' && !!node.composition && walk(node.composition.scene.objects)) || rebuilds(node, walk));
  return walk(scene.objects);
}

/** A pack saved without its geometry is rebuilt from its original: what the original needs counts too. */
const rebuilds = (node: SceneNode, walk: (nodes: SceneNode[]) => boolean) =>
  node.kind === 'object' && !!node.packed && !node.packed.geometry && !!node.packed.original && walk([node.packed.original]);

/** Does the scene bring the markup of an SVG? (then it needs the importer) */
export function sceneNeedsImporter(scene: SceneV1): boolean {
  const walk = (nodes: SceneNode[]): boolean =>
    nodes.some((node) => (node.kind === 'object' && !node.packed) || (!!node.children?.length && walk(node.children)) || (node.kind === 'group' && !!node.composition && walk(node.composition.scene.objects)) || rebuilds(node, walk));
  return walk(scene.objects);
}

/**
 * Loads what the scene needs and returns the effects to build the engine with.
 * Throws if the scene asks for an effect that doesn't exist.
 */
export async function prepareScene(scene: SceneV1): Promise<ModifierDef<any>[]> {
  const types = sceneEffectTypes(scene);
  const unknown = types.filter((t) => !effectLoaders[t]);
  if (unknown.length) throw new Error(`svertik: unknown effects: ${unknown.join(', ')}`);

  const defs: ModifierDef<any>[] = [];
  await Promise.all(
    types.map(async (type) => {
      defs.push(...(await effectLoaders[type]!()));
    }),
  );

  // The fonts of the texts (and, with them, opentype.js).
  if (sceneHasText(scene)) await loadFonts(scene);
  // The heavy kernels (WebAssembly), only if the scene has an effect that uses them. If they cannot
  // be loaded, each effect falls back to its version in TypeScript: the scene still draws the same.
  if (types.some((t) => kernelEffects.has(t))) await initKernels();
  // The importer of SVG, only if the scene brings the markup of one.
  if (sceneNeedsImporter(scene)) {
    const mod = await import('./import');
    setSVGImporter(mod.parseSVG);
  }

  return defs;
}
