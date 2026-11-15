// The minimal player: the engine, the effects of the scene, and nothing else.
//
// This entry point is what a website embeds. It doesn't bring the editor's baggage (the descriptions of
// the effects, Lottie, the motion analysis, the validation…) nor the heavy parts that a scene may not
// need (the importer of SVG, the fonts): those are loaded on demand by `prepareScene`.

export { createEngine, type Engine, type StackInput } from './engine';
export { createPlayer, type PlayerOptions } from './interactions';
export { prepareScene, sceneEffectTypes, sceneHasText, sceneNeedsImporter } from './prepare';
export { setSVGImporter, hasSVGImporter, type SVGImporter } from './importer';
// Las fuentes: una web que incruste el reproductor puede darle las suyas (con `registerFont`),
// en vez de que se bajen de Fontsource.
export { registerFont, fontKey, fontNames, hasFont } from './fonts';
export { isScene, type SceneV1, type SceneNode, type ShapeNode, type ObjectNode, type GroupNode } from './scene';
export { effectTypes } from './modifiers/manifest';
// The heavy kernels (WebAssembly). `prepareScene` loads them when the scene needs them; this is for
// whoever builds the engine by hand.
export { initKernels, kernels, type Kernels } from './kernels';

// Frame sampling for deterministic video exports without loading the editor.
export { sampleScene } from './animation';
