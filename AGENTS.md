# svertik Guide for AI Agents (Headless & No-MCP)

> **svertik** is a non-destructive SVG procedural generation and motion graphics engine.  
> Projects and scenes are expressed in **pure JSON (`SceneV1`)**, evaluated through a stack of modifiers on cubic Bézier paths, and output as standard SVG. **No UI or MCP server is needed** to generate demos, construct scenes, or build animated graphics.

---

## 📚 Documentation & Reference

- **[Comprehensive Engine & Effects Guide](docs/ENGINE_AND_EFFECTS.md)**: Deep dive into the architecture, execution rules, geometric primitives, and effect parameters, ranges, defaults, and notes.
- **[Scene Recipes (Templates for AI Agents)](docs/SCENE_RECIPES.md)**: 6 fully-formed, validated JSON scene templates (kinetic typography, procedural mandalas, cyberpunk glitch, organic metaballs, mechanical orbital systems, and risograph halftone prints).
- **Auto-generated Reference Pages**: [`packages/engine/docs/reference/index.md`](packages/engine/docs/reference/index.md) (individual markdown documentation for every effect and shape).

---

## 🚀 Agent Workflow (CLI & Scripts)

### 1. Terminal CLI Execution

Save any scene JSON or `.svrtk` file and render it headlessly:

```bash
# Render a static scene to standard SVG
pnpm svertik render scene.json -o out.svg

# Render a crisp PNG (scale x2, solid dark background)
pnpm svertik render scene.json -o out.png --scale 2 --background "#0d0d10"

# Render a specific animation timestamp (seconds)
pnpm svertik render scene.json -o frame.png --time 1.5

# Render the entire animation as numbered PNG frames
pnpm svertik render scene.json --frames ./frames/ --fps 30

# Dump all effect and primitive parameter schemas in JSON format
pnpm svertik effects --json
```

### 2. Programmatic TypeScript / Node.js

```ts
import { builtins, createEngine, validateScene, type SceneV1 } from '@svertik/engine';

const scene: SceneV1 = {
  version: 1,
  document: { width: 800, height: 450 },
  objects: [
    {
      kind: 'shape',
      id: 'star-1',
      name: 'Star',
      shape: 'star',
      params: { radius: 120, innerRadius: 60, points: 5, fill: true, fillColor: '#09fdd1' },
      stack: [
        { id: 'twist-1', type: 'twist', params: { angle: 45, radius: 0.8 } }
      ]
    }
  ]
};

// Always validate: checks for duplicate IDs, unknown params, or missing node targets
const report = validateScene(scene);
if (report.errors.length) console.error('Errors:', report.errors);
if (report.warnings.length) console.warn('Warnings:', report.warnings);

// Evaluate to SVG string
const engine = createEngine(builtins);
const svg = engine.toSVG(scene);
```

---

## ⚡ Golden Rules for `SceneV1`

1. **`version: 1`**: Mandatory field.
2. **Layer Order (`objects`)**: The **first object in the array (`index 0`) is drawn in FRONT** (closest to the viewer), identical to layer stacks in Figma or Illustrator.
3. **Unique IDs**: Every `id` across `objects` and modifier `stack` items must be unique within its scene. Compositions have isolated nested scenes, so their internal IDs may repeat in other compositions.
4. **Coordinate System**: Y increases downwards. Rotations are clockwise in degrees.
5. **Fractions vs Pixels**: Anchors and centres (`center`, `pivot`, `anchor`) use normalized `[fx, fy]` fractions (`0` to `1`, where `[0.5, 0.5]` is the bounding box centre).
6. **Effector Containers (`step`, `stagger`, `range`, `field`, `oscillate`, `wiggle`, `pulse`, `shake`)**: Take nested modifiers inside their `children` array. **Never nest an effector inside another effector**.
7. **Filters (`kind: "filter"`) & Masks (`mask`)**: Always execute after the entire geometry stack has evaluated, regardless of array position.
8. **Text (`shape: "text"`)**: Each glyph is converted into an independent vector element, enabling `step`, `stagger`, `range`, or `explosion` to act character-by-character. Its `font` is a Fontsource family (`weight` and `italic` go apart, never inside the name).
9. **Scene notes**: Before editing, animating, or generating a scene, check its optional `notes` field and treat it as user-provided direction. Preserve the notes unless asked to revise them. Notes are project metadata and are not rendered into SVG.
10. **Expressions and custom variables**: A numeric parameter may store `{ "$expr": "...", "fallback": 12 }` instead of a number. Evaluate it per frame with `scene.time` (seconds), `scene.cycle` (completed duration windows, starting at 0), `scene.frame`, `scene.fps` (default 30), `scene.duration`, `scene.progress`, and `scene.seedGenerator`. Document-level numeric variables live in `custom` and are referenced as `scene.custom.name`; their values can also be expressions that reference other custom variables. The engine resolves dependencies; missing references and cycles use each expression's `fallback`. Nested compositions have their own `custom` scope. Use only the expression language's math functions (`min`, `max`, `clamp`, `lerp`, `sin`, `cos`, `tan`, `abs`, `round`, `floor`, `ceil`, `sqrt`, `pow`, `atan`, `atan2`; trig works in radians and `deg(x)` turns radians into degrees for angle parameters, `random(min, max, seed?)`), plus `scene.countDown(seconds)`; this is not JavaScript. In Text shape content, `{{scene.time}}` and other numeric expressions interpolate live values, e.g. `{{scene.countDown(10)}}`; use `{{fixed(scene.time, 2)}}` for fixed decimal places or `{{fixed(scene.time, 2, 2)}}` to zero-pad the integer part too. Numeric expressions replace keyframes on the same parameter. Render-time measurements are diagnostic, machine-dependent data and are not expression variables.

Example shared controls in scene JSON:

```json
{
  "custom": {
    "density": 0.65,
    "spacing": { "$expr": "scene.custom.density * 12", "fallback": 7.8 }
  },
  "objects": [
    {
      "kind": "shape",
      "id": "field",
      "name": "Field",
      "shape": "rectangle",
      "params": { "width": { "$expr": "scene.custom.spacing * 100", "fallback": 780 } },
      "stack": []
    }
  ]
}
```

## Compositions

Store a composition as a `kind: "group"` with `children: []` and `composition: { scene: SceneV1, params?: { time, start, speed, offset, reverse, loop, frameRate }, modulation?: { type, params } }`. The nested scene owns its IDs, notes, document, animation and interactions. References stay inside that scope. `time` normally stores `{ "$expr": "scene.time", "fallback": 0 }` and is evaluated in the parent; descendants use the remapped local clock. `loop` is `hold`, `loop` or `pingpong`. Do not put stored objects in both `children` and `composition.scene.objects`. See the Compositions section of `docs/ENGINE_AND_EFFECTS.md` for the current interaction/cropping limitations.

Composition clock fields support tracks with `on: "composition"`. Numeric time keys can freeze/reverse a scene; a Time expression replaces those keys. `frameRate: 0` means free playback, positive values quantize local time. Clock modulation accepts Oscillate/Wiggle/Pulse/Shake signals in seconds. Named local timeline markers are stored as `animation.markers: [{ id, name, t }]`.

## Mouse Instance

An instance with `mouse: { event, rate?, distance?, button?, count?, lifetime?, limit?, offset?, scale?, rotation?, scatter?, scaleVariation?, rotationVariation? }` generates temporary copies from canvas input in `createPlayer`. Events: `click`, `double-click`, `right-click`, `middle-click`, `move`, `wheel-up`, `wheel-down`. `of` links its source (may be hidden). Each copy starts the source animation at zero. `lifetime: 0` retains copies up to `limit`; headless exports have no input/copies. Generators belong to the outer scene; compositions can be sources. See Mouse Instance in `docs/ENGINE_AND_EFFECTS.md`.

`fullViewport` on SceneV1 fills the whole viewport in both Play hosts (off/absent by default), fitted like CSS `object-fit`: `true` or `"contain"` shows the whole document without distortion (bands where the aspect ratio differs), `"cover"` fills the screen and crops the overflow, `"stretch"` fills both axes and distorts. `createPlayer` sets SVG `preserveAspectRatio` to `xMidYMid meet`, `xMidYMid slice` or `none`; document coordinates, editor bounds and headless exports stay unchanged.

## Infinite time and cycle

Set `animation: { duration: 10, infinite: true, loop: false, fps: 30, tracks: [] }` for procedural or interactive scenes that must keep running. In the editor, **Document → Time → Infinite** and **Timeline → Infinite** control the same flag. Off/absent is the existing finite mode. Infinite disables scene Loop; the clock never wraps or stops at `duration`, in editor playback and both Play hosts. The timeline remains editable within its configured duration, and its playhead stays at the end while the elapsed-time counter continues. Pause/resume keeps elapsed time; Go to start resets it.

- `scene.time` and `scene.frame` continue increasing; `scene.duration` remains the configured timeline/export duration. `scene.progress` reaches 1 and stays there.
- `scene.cycle = floor(scene.time / scene.duration)` (0 if duration is non-positive). It is a zero-based counter of completed duration windows, **not an automatic loop**: for duration 10, time 0–9.999 has cycle 0; time 10 has cycle 1; time 180 has cycle 18. Available in numeric formulas, custom variables and Text `{{scene.cycle}}`. It uses the current scene's local clock/duration, so a looping composition's cycle follows its remapped clock, not the parent's elapsed time.
- Tracks are sampled at `min(scene.time, scene.duration)` in Infinite mode and hold that sample afterwards, including track repeats. Expressions and procedural effect clocks continue using the actual elapsed time. Do not loop the root scene to keep a procedural clock alive.
- To repeat authored animation, put it in a composition with `params: { time: { "$expr": "scene.time", "fallback": 0 }, loop: "loop" }`. Parent Infinite and child composition Loop are independent. A composition with `hold` still holds its own final frame.
- `sampleScene(scene, seconds)` preserves unbounded elapsed time in `at`; evaluate it with the engine to resolve expressions. Headless frame rendering can sample arbitrary times. Finite SVG/PNG-frame/video exports still use `animation.duration`; Infinite does not request an endless export or record live mouse input.
- Enabling Infinite saves `infinite: true, loop: false`. Disabling it clamps editor time back to duration and leaves Loop off. Imported scenes with both `infinite: true` and `loop: true` use Infinite (validation warns).

Example: `custom: { variation: { "$expr": "scene.cycle", "fallback": 0 } }` exposes a value that changes once per duration window without restarting the scene. Preserve scene notes when adding these controls, and always validate the scene.

## Re-seeding on a beat (`seedEvery`)

`seedEvery: 1` on SceneV1 (seconds; 0 or absent = off; editor: **Document → Seed generator → Every**) gives `scene.seedGenerator` a new value each interval of scene time: the base seed plus 7919 per elapsed interval, so seeds offset by small numbers (`scene.seedGenerator + 10`) never collide across intervals. Everything linked to the generator (effect seeds, `random()`, layouts) changes on that beat, and the same time always gives the same seed, in Play and exports alike. Compositions without their own seed follow the parent's live seed. Combine it with `animation.infinite: true` for an endless sequence (a looping timeline repeats the sequence each loop). It makes the scene time-driven.

## Deterministic random in ƒx

Use `random(min, max, seed?)` in numeric expressions, custom-variable formulas or text interpolation. It is reproducible, stateless and based on `scene.seedGenerator` plus the optional numeric seed/salt (default 0). Same base seed and salt give the same result regardless of playback time, evaluation order or export; it does not advance an RNG on each call. Bounds are normalized if reversed; equal bounds return that value. Prefer integer salts for per-event or per-cycle variation; negative and fractional salts are supported.

- `random(0, 100)`: one stable value, changed by the document's seed dice.
- `random(0, 100, scene.cycle)`: a stable value within each duration window; changes in the next cycle with Infinite time.
- `random(0, 100, scene.frame)`: changes per frame; `random(0, 100, floor(scene.time * 2))`: changes twice per second.
- `random(0, 100, scene.cycle + 1000)`: a separate stream. Identical seed/salt calls in different fields are correlated; use different salts for independent values. The third argument supplements rather than replaces the document seed.
- `floor(random(0, 6, scene.cycle)) + 1`: an integer from 1 to 6. `random` normally returns a continuous value in `[min, max)`.

There is no `Math.random()` or JavaScript in ƒx. Inputs must be finite; invalid runtime inputs use the numeric expression's fallback. Each composition uses its own/inherited document seed and local clock. Keep the document seed and salts unchanged to reproduce a render.

Mouse Instance numeric controls also accept `{ "$expr": "...", "fallback": number }`, including rate/distance/count/lifetime/limit, scale/rotation and all variation amounts. Offset is `[number | expression, number | expression]` with separate Offset X/Y controls in the inspector. Event/button/source remain selectors. Expressions are sampled **per input event at the parent scene's current playback time**, before throttling; each copy samples and keeps its own birth transform/lifetime. Custom variables, `scene.cycle` and deterministic `random()` work here. Inside Mouse config, `random(-180, 180)` automatically varies per generated copy using an implicit birth-index salt. An explicit third argument overrides it: `random(0, 90, scene.cycle)` shares a sample within the cycle and `scene.frame` within the frame. Outside Mouse-generated copies, omitted salts remain 0 and random values stay stable. Keep finite fallbacks and respect rate/count/limit caps. See Mouse Instance expressions in the comprehensive guide.

Mouse Instance also propagates its implicit per-copy random salt into the source object's shapes, effect stacks (including Paint Amount), custom-variable formulas, text expressions and nested source compositions. `random(0, 1)` in a Cross source's Paint `fillAmount` gives each generated copy its own mix amount, stable over its lifetime. Explicit third arguments still override per-copy variation. The source's saved formula and document seed stay unchanged. Generated composition wrappers carry the runtime `composition.randomSalt` context; agents should not add this field to authored scene JSON. Paint Amount mixes the base fill with Paint's fill color, so choose different colors to see variation.

## Per-click color palettes

For Mouse Instance source colors, use Color `{ "type": "color", "params": { "mode": "palette", "palette": ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff"], "paletteMode": "random", "seed": 1, "target": "fill" } }`. Palette chooses one exact entry per accepted input emission, shared by all copies from that click; repeats on consecutive clicks are allowed. The source/nested compositions keep the same choice across frames with static settings. No cycle expression is needed. The inspector exposes editable color entries with add/remove controls. `paletteMode: "index"` enables numeric/ƒx `index` (zero-based, floored, wrapping), bypassing automatic per-click choice. Validate non-empty `#rrggbb` arrays. Color's existing `mode: "random"` now varies per generated Mouse copy using its Seed/Variation, rather than repeating the same source color; it is not palette-constrained. Outside Mouse, normal static seeds retain existing deterministic behavior. See the full guide's Color Palette section.

Mouse Instance can gate input with `mouse.target: "<node-id>"` (default empty: whole canvas). An invisible rectangle is sufficient to define a region, e.g. width 400 / height 600 at x=-200 for the left half of an 800×600 document. It uses the target's evaluated closed contours, transforms and animation, even if hidden; paint/filter opacity does not define the region. Outside input is ignored before rate/distance checks or palette selection; missing targets accept nothing and validation warns. Target and source (`of`) are separate same-scope references. The player provides geometry automatically; direct `.event` callers pass an evaluated DocumentResult as argument 6. Mouse's inspector omits generic Display/Interactions/Animate and footer node actions; manage visibility/removal in layers, and styling/animation through its effect stack or source.


Mouse output uses the normal effect pipeline: the player materializes each generator as a runtime group containing all live, placed copies, and applies its saved stack once to that collection in order. No Mouse-specific symmetry fields. Add Mirror with `reference: "<Limit-id>", axis: "horizontal", position: 1, original: "keep"` to reflect the output across a hidden Limit rectangle's right edge. Reference is a general Mirror node parameter; empty uses its usual object bounds. Target gates input only, while Mirror can draw outside it. Source effects animate per copy before the generator stack; effects after Mirror process the combined result. Limit/lifetime govern source births, so reflected geometry disappears automatically with them. Stable birth/emission metadata preserves generator-stack Color Random per copy and Palette per click. See the comprehensive guide.
