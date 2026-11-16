# @svertik/engine — guide for agents

Non-destructive SVG effects and motion. A **scene** (plain JSON) describes objects, a stack of effects on
each one, an optional animation and optional interactions. The engine evaluates it to SVG paths. Nothing is
baked: change a parameter and the result is recomputed.

- Reference of every effect and primitive (parameters, defaults, ranges, JSON snippets): [`docs/reference/index.md`](docs/reference/index.md).
- Overview and concepts: [`docs/index.md`](docs/index.md).
- Always run `validateScene(scene)` on a scene you wrote: it lists errors and silent mistakes (unknown params, ids that point nowhere).

## Minimal use

```ts
import { builtins, createEngine, validateScene, type SceneV1 } from '@svertik/engine';

const scene: SceneV1 = {
  version: 1,
  custom?: Record<string, number | { $expr: string, fallback: number }>, // expression variables: scene.custom.name
  document: { width: 800, height: 450 },
  objects: [
    {
      kind: 'shape', id: 'star-1', name: 'Star', shape: 'star',
      params: { radius: 120, points: 5, fillColor: '#09fdd1' },
      stack: [{ id: 'twist-1', type: 'twist', params: { angle: 60 } }],
    },
  ],
};

const report = validateScene(scene); // { errors: string[], warnings: string[] }
const engine = createEngine(builtins);
const svg = engine.toSVG(scene);      // a standalone SVG string
```

In a browser, to draw and animate into an existing `<svg>` (timeline + interactions):

```ts
import { builtins, createEngine, createPlayer } from '@svertik/engine';
const player = createPlayer(createEngine(builtins), svgElement, scene); // player.stop() to clean up
```

Other entry points: `engine.evaluateDocument(scene)` (geometry + per-node info), `engine.mount(svg, scene)`
(draw and `update(scene)` per frame), `sampleScene(scene, t)` (the scene at time `t`, seconds),
`toLottie(engine, scene)`, `toAnimatedSVG(engine, scene)`.

**Node.js:** importing SVG sources (`kind: "object"`) needs a `DOMParser` (e.g. from `happy-dom`). Text needs
fonts: `await registerFont(name, arrayBuffer)` (it is async: it loads the font parser only then) or, in the
browser, `await loadFonts(scene)` (Fontsource via jsDelivr).

## The minimal player (`@svertik/engine/player`)

For embedding in a website: the engine, and only what the scene uses.

```ts
import { createEngine, createPlayer, prepareScene } from '@svertik/engine/player';

const effects = await prepareScene(scene);   // loads the scene's effects (each one its own chunk)
const player = createPlayer(createEngine(effects), svgElement, scene);
```

`prepareScene` also loads the fonts if the scene has text, and the SVG importer if it brings raw SVG. Without
it, the engine throws (an unknown effect, or a missing importer) instead of failing quietly.

This entry point does not bring the editor's baggage (effect descriptions, Lottie, motion analysis,
validation) nor `opentype.js` (the font parser, ~77 KB gzip) unless the scene has text. The ready-made
bundle for a website is in `apps/player` (`pnpm --filter @svertik/player build`); `pnpm size` measures it.

## Reading a scene without the engine (`@svertik/engine/scene`)

The shape of a scene (its types and `isScene`) is in its own entry point, with nothing of the engine:

```ts
import { isScene, type SceneV1 } from '@svertik/engine/scene';
```

Whoever only reads a scene (a link, a file, a test) uses it, so the engine stays in its own chunk.

## The scene (`SceneV1`)

```ts
{
  version: 1,
  objects: SceneNode[],            // the FIRST one is drawn IN FRONT (like layers in a design tool)
  document?: { width, height, x?, y? } | null, // fixed frame centred at (x, y); without it, fits the drawing
  resolution?: number,             // subdivision before deforming, fraction of each object's size (0.01)
  animation?: { duration, loop?, autoplay?, fps?, tracks: Track[] },
  interactions?: Interaction[],
}
```

### Nodes

Every node: `id` (unique), `name`, `stack` (effects, applied top to bottom), and optionally
`transform: { x, y, scale, rotation, flipX, flipY, pivot }`, `opacity`, `blend` (CSS blend mode), `visible`.

| `kind` | Extra fields | What it is |
| --- | --- | --- |
| `shape` | `shape`, `params` | A primitive (rectangle, ellipse, polygon, star, line, spiral, text, cross, arrow, pawn). See `docs/reference/shapes/`. |
| `object` | `source` | An imported SVG (its markup as a string). |
| `group` | `children`, optional `composition: { scene, params }` | Children drawn together; the group's stack applies to all of them at once (each child is an element). |
| `instance` | `of` | A live copy of another node's result (with its effects), with its own transform and effects on top. |
| `effector` | `targets`, `delay?` | Draws nothing: its stack is appended to each target's stack, separately. `delay` (s) staggers its animation per target. |

### Effects (`stack` items)

```ts
{ id: 'bend-1', type: 'bend', params: { angle: 45 }, enabled?: true, children?: [...] }
```

- `type` is one of the built-ins (see the reference). Missing `params` take their defaults.
- `children`: only in Step, Stagger, Range, Field, Oscillate, Wiggle, Pulse, Shake (effectors: they apply their children per element) and RGB Split.
- Params of type `node` hold another node's `id` (Clone on an object, Path Wrap, Morph, Mask, Connect, Look At…).
- **Elements**: many effects work per element: the copies of Clone, the children of a group, the letters of a
  text, the pieces of Crack/Damage, Mosaic tiles. Without any, each shape of the drawing is one.

### Animation

```ts
{ id: 'k1', node: 'star-1', on: 'modifier', modifier: 'twist-1', param: 'angle',
  keys: [{ t: 0, value: 0, ease: 'ease-in-out' }, { t: 2, value: 180 }], repeat?: 0, every?: 3 }
```

- `on: "node"` animates `x`, `y`, `scale`, `rotation`, `opacity`; `on: "shape"` a primitive param;
  `on: "modifier"` an effect param (also `enabled`, true/false).
- `ease` (on the key where a segment starts): `linear`, `ease-in`, `ease-out`, `ease-in-out`, `expo-in|out`,
  `back-in|out`, `elastic-in|out`, `bounce-in|out`, `hold`.
- `repeat`: how many times the keys play (0 = forever); `every`: seconds from one start to the next.

### Interactions

```ts
{ id: 'i1', node: 'star-1', trigger: 'hover', target: { node: 'star-1', on: 'node', param: 'scale' },
  to: 1.2, duration: 0.3, ease: 'back-out' }
```

- `trigger`: `hover`, `click`, `enter` (scrolls into view), `pointer`.
- `action`: `tween` (default: go to `to` and back), `play` (a `segment` of the timeline), `seed` (new random
  seed for an effect), `toggle` (an effect on/off), `follow` (with `pointer`: a value follows the pointer;
  `target.param: "position"` moves the node, a fractional point of an effect goes under the pointer, a number
  maps across the document to `range`; `duration` is the lag, `stay` keeps it when the pointer leaves).
- They run in `createPlayer` (and in the editor's Play mode), not in `toSVG`.

## Conventions (where agents usually go wrong)

- **Custom variables**: define optional document-scoped numeric values in `custom`, then reference them in expressions as `scene.custom.name`. A value can itself be `{ "$expr": "...", "fallback": number }`; dependencies between variables resolve automatically. A number can carry a range, `{ "value": 6, "min": 1, "max": 20, "step": 1 }`: the editor shows it as a slider and the value is clamped to the range. Missing names and cyclic dependencies use their expression fallbacks. Each composition has its own custom-variable scope. See the examples in the root `AGENTS.md` and `docs/ENGINE_AND_EFFECTS.md`.

- **Coordinates**: y grows downwards. A node is centred on its `transform.x/y` (the centre of its own
  drawing). Rotations in degrees, clockwise.
- **Fractions**: `point` params with unit `fraction` (centres, pivots, anchors) and `fraction` numbers
  (radii) are relative to the box the effect measures: the object's drawing, or what an earlier Clone,
  Mirror… produced. `[0.5, 0.5]` is the centre.
- **Percentages**: some px params also take text like `"50%"` (Rectangle/Ellipse `width` and `height`
  of the document, Rectangle radii of half the shorter side). A plain number is px. See the reference.
- **Order matters**: the stack runs top to bottom. Filters (Shadow, Blur, Glow, Grain, Displace, Bevel,
  Thicken, Tone) and Mask always apply after the whole stack, whatever their position.
- **Ids** must be unique across nodes and across effects (tracks and interactions refer to them).
- **Colours** are `#rrggbb` strings.
- **Fonts of a text**: `font` is the family alone (a Fontsource one, e.g. `JetBrains Mono`) and `weight`
  and `italic` are apart. A name with the style inside (`JetBrains Mono Bold`) is a name from before the
  weights existed: the editor still has it, but only the editor.
- The editor is at the project's site; a scene can be opened there to check it visually.

### Compositions

A group with `composition` stores a nested SceneV1; keep its `children` empty. Nested IDs/references are scoped to that scene. The engine samples its local clock (`time`, `start`, `speed`, `offset`, `reverse`, `loop`) and namespaces its rendered nodes. Repeated IDs in different compositions are valid. `validateScene` recursively checks nested scopes and rejects cycles/depth >32. `prepareScene` and font discovery include nested scenes. Numeric clock expressions run in the parent; child expressions/effects run locally. See `docs/ENGINE_AND_EFFECTS.md` for editor usage and current interaction/cropping limitations.

Time Remap: use tracks with `on: "composition"` for Time/Start/Speed/Offset/Playback FPS. `composition.modulation` shares signal schemas with Oscillate/Wiggle/Pulse/Shake, adding seconds before wrapping and quantization; `frameRate` quantizes final local time (0 means free). `animation.markers` stores `{ id, name, t }` in local seconds. See the Time Remap section of `docs/ENGINE_AND_EFFECTS.md`.

### Infinite playback and scene.cycle

`animation.infinite: true` keeps the scene clock advancing beyond `animation.duration`; use `loop: false` with it. The editor calls this **Infinite** (Document → Time and Timeline). `createPlayer` implements the same behavior in both full-screen/editor and shared-link Play. Default is finite. Duration remains the timeline/export window; scene Loop is disabled and ignored while Infinite is active. Parent tracks hold their sample at duration; expressions, simulation/procedural clocks and interactive generation continue. Repeat authored animation inside a composition with `composition.params.loop: "loop"` and its Time expression linked to `scene.time`.

`scene.cycle` is available in expressions, custom variable formulas and text interpolation: `floor(scene.time / scene.duration)`, zero-based, with 0 for non-positive duration. A 10-second scene at 180 seconds reports 18. `scene.progress` remains clamped at 1; `scene.time` and `scene.frame` continue increasing. Every composition evaluates these variables against its own remapped local clock and duration. A composition's Loop may therefore reset its own cycle; the parent cycle continues. `sampleScene(scene, t)` keeps real elapsed `at` while clamping only timeline-track sampling to duration in Infinite mode. Finite exports still use the configured duration. See the Infinite time section of the comprehensive engine guide and root AGENTS.md for authoring rules.

### Random expressions

`random(min, max, seed?)` is a deterministic, stateless ƒx function, available in parameters, custom formulas and Text `{{...}}`. It hashes the scene's `seedGenerator` with the optional numeric salt (default 0), then samples the engine RNG once. Same pair produces the same sample in editor/Play/headless rendering and when seeking backwards. `random(0, 100)` stays stable over time; `random(0, 100, scene.cycle)` varies per duration window in Infinite mode; `random(0, 100, scene.frame)` varies per frame. Identical seed/salt pairs are correlated across fields: offset the salt for distinct streams. Negative/fractional salts are supported. Bounds are reordered if reversed and equal bounds return that value. Results are continuous in `[min, max)`; use `floor(random(0, 6, salt)) + 1` for a die. Invalid/non-finite inputs fall back through normal numeric-expression fallback handling. Do not use `Math.random()` in scene JSON.

Mouse Instance's `mouse` numeric values and both `mouse.offset` components support numeric expressions. Config formulas are sampled on input against the parent playback clock (including Infinite), with its seed/custom-variable scope; each emitted copy stores that configuration. Rate/distance evaluate before throttling. Invalid expressions fall back safely; emitted count/limit remain capped. `createMouseInstances(...).event(kind, point, monotonicSeconds, buttons?, sceneTime?)` accepts an explicit scene time; direct callers default to `monotonicSeconds`, while `createPlayer` passes its actual sampled scene clock. Offset's inspector shows separate ƒx controls for X/Y while JSON remains an array. Existing copies retain their transform/lifetime; formula JSON is never overwritten. See the full guide's Mouse Instance expressions section for an example and bounds.

In Mouse Instance config, two-argument `random(min, max)` uses an implicit deterministic birth-index salt: each copy gets a new sample (also within a multi-copy emission) and retains its rotation/scale/offset/lifetime. Rate/count/distance/limit sample once per input event. Explicit third arguments override the implicit salt, so `random(0, 90, scene.cycle)` intentionally shares the sample for that cycle. Outside Mouse-generated copies, omitted salts still default to 0. The expression evaluator accepts optional `{ randomSalt }` for this host context; it does not change the document seed or add a public scene variable.

Mouse Instance also propagates its implicit per-copy random salt into the source object's shapes, effect stacks (including Paint Amount), custom-variable formulas, text expressions and nested source compositions. `random(0, 1)` in a Cross source's Paint `fillAmount` gives each generated copy its own mix amount, stable over its lifetime. Explicit third arguments still override per-copy variation. The source's saved formula and document seed stay unchanged. Generated composition wrappers carry the runtime `composition.randomSalt` context; agents should not add this field to authored scene JSON. Paint Amount mixes the base fill with Paint's fill color, so choose different colors to see variation.

### Color palette and Mouse color seeds

Color now accepts `mode: "palette"`, `palette: string[]` (non-empty #rrggbb colors), `paletteMode: "random" | "index"` and numeric/ƒx `index`. Palette Random selects one exact entry per accepted Mouse input event, shared by that event's copies; consecutive picks may repeat. Palette Index wraps floored indices and bypasses automatic event seeding. Color Random (hue/lightness Variation) varies per generated Mouse copy. Runtime composition wrappers propagate `eventSalt` (shared palette pick) alongside `randomSalt` (per-copy expressions), including nested sources. These are runtime context, not fields agents should author. Base document seed and Color Seed determine reproducible choices. The schema's new `palette` type is edited as a color list, appears in document color discovery/remapping and is left untouched by parameter randomization. Outside Mouse, Color uses its stored seed normally. See `docs/reference/effects/color.md` and the comprehensive guide for exact params/examples.

### Mouse Target area

`mouse.target` is an optional same-scope node reference; empty means whole canvas. A hidden rectangle/group/closed shape gates input using its evaluated contours in document coordinates, with transforms/effects/animation, independently of its paint or visibility. `createPlayer` passes `live.doc()` to Mouse `.event(..., sceneTime, doc)`; direct callers must supply doc when a target is set. Missing targets/no geometry ignore input. Geometry is cached per DocumentResult/target; closed contours use the target's fill rule and include the border. Outside input neither emits nor advances emission seeds/rate gates nor prevents browser defaults. Validation catches broken references; composition scoping and paste remapping preserve the target link. See the comprehensive guide for a validated half-scene JSON example. The Mouse-specific inspector hides generic display/interaction/animation/preset/footer controls; layers still control visibility/deletion.


Mouse `.apply` materializes a root runtime group with the generator ID and live copies as children; its stack processes the placed collection in order. The source's stack remains evaluated on its local per-birth clock. General Mirror `reference` (node id, default empty) supplies axis bounds, e.g. Limit right edge with position 1. Runtime group `elementIndex`/`eventIndex` and shape `emission` retain stable per-birth/per-click color choices through collection edits. Do not author these runtime fields. Mouse-specific symmetry fields have been removed; use chained Mirror effects instead.
