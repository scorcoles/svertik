# Comprehensive svertik Engine & Effects Guide

> **Technical Reference for AI Agents & Headless Developers**<br>
> Complete documentation for authoring procedural SVG motion graphics, scenes, and demos directly with `@svertik/engine` and the terminal CLI, **without requiring a graphical user interface (UI) or MCP server**.

---

## 1. Engine Philosophy & Architecture

**svertik** is a non-destructive vector procedural generation and animation engine for SVG. Unlike traditional vector software that destructively bakes coordinates and control points:
1. **The Source Remains Untouched:** Base shapes (primitives or imported SVG files) are never mutated.
2. **Modifier Stack:** Each node maintains a linear stack of modifiers evaluated from top to bottom. Adjusting any parameter recalculates only the affected downstream pipeline using staged step-caching.
3. **Pure Standard SVG:** The engine outputs standard cubic Bézier paths (`<path>`), native SVG attributes, `<defs>` gradients, and standard `<filter>` primitives. There are zero proprietary runtime dependencies for rendering; output SVGs render in any modern browser or SVG viewer.
4. **Deterministic:** All procedural variation (noise, fractures, edge wear, jitter) is governed by an integer `seed`. The identical scene JSON will always produce bit-for-bit identical SVG geometry.

```
┌────────────────────────────────────────────────────────┐
│                   Scene (SceneV1)                      │
│  - Document bounds (fixed viewBox or fit-to-drawing)   │
│  - Objects array (1st element is in FRONT, like layers)│
└──────────────────────────┬─────────────────────────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
      Shape / SVG Object          Instance / Effector
             │                           │
             ▼                           ▼
   ┌───────────────────┐       ┌───────────────────┐
   │   Modifier Stack  │       │   Modifier Stack  │
   │   - Deformers     │       │   - Deformers     │
   │   - Generators    │       │   - Generators    │
   │   - Effectors     │       │   - Effectors     │
   │   - Styles        │       │   - Styles        │
   └─────────┬─────────┘       └─────────┬─────────┘
             │                           │
             ▼                           ▼
     SVG Filters & Mask          SVG Filters & Mask
             │                           │
             └─────────────┬─────────────┘
                           │
                           ▼
                  Flat SVG String
             or Live DOM Mount (<svg>)
```

---

## 2. Headless Operation (No UI or MCP Required)

AI agents can generate scenes to disk and evaluate or render them immediately without opening a browser:

### A. Terminal CLI

```bash
# Render a scene to flat SVG
pnpm svertik render scene.json -o out.svg

# Render a high-resolution PNG with background colour
pnpm svertik render scene.json -o out.png --scale 3 --background "#0d0d10"

# Render a specific animation timestamp (e.g. at 1.5 seconds)
pnpm svertik render scene.json -o frame.svg --time 1.5

# Export the entire animation as numbered PNG frames
pnpm svertik render scene.json --frames ./frames/ --fps 30

# Inspect objects, modifiers, and animation tracks
pnpm svertik info scene.json

# Dump the full JSON schema of all effects and shapes
pnpm svertik effects --json
```

### B. Programmatic TypeScript / Node.js

```ts
import { builtins, createEngine, validateScene, type SceneV1 } from '@svertik/engine';
import { writeFileSync } from 'node:fs';

const scene: SceneV1 = {
  version: 1,
  document: { width: 800, height: 600, x: 0, y: 0 },
  objects: [
    {
      kind: 'shape',
      id: 'star-1',
      name: 'Star',
      shape: 'star',
      params: { radius: 150, inner: 0.5, points: 6, fillColor: '#09fdd1' },
      stack: [
        { id: 'twist-1', type: 'twist', params: { angle: 45, radius: 0.8 } }
      ]
    }
  ]
};

// 1. Always validate before evaluating
const report = validateScene(scene);
if (report.errors.length > 0) {
  throw new Error(`Scene validation errors: ${report.errors.join(', ')}`);
}

// 2. Instantiate engine with builtin modifiers
const engine = createEngine(builtins);

// 3. Render directly to standalone SVG string
const svg = engine.toSVG(scene);
writeFileSync('out.svg', svg, 'utf8');
```

---

## 3. Scene Specification (`SceneV1`)

A scene is a plain JSON structure typed as `SceneV1`:

```ts
interface SceneV1 {
  version: 1;                         // Required: must be 1
  document?: {                        // Optional: fixed frame/viewBox
    width: number;                    // Canvas width in px
    height: number;                   // Canvas height in px
    x?: number;                       // Centre X coordinate (default 0)
    y?: number;                       // Centre Y coordinate (default 0)
  } | null;
  resolution?: number;                // Curve subdivision tolerance (default 0.01)
  objects: SceneNode[];               // Layer nodes. THE FIRST OBJECT IS IN FRONT!
  animation?: {                       // Optional: keyframe timeline
    duration: number;                 // Total duration in seconds
    loop?: boolean;                   // Repeat loop (default true)
    autoplay?: boolean;               // Autoplay on load
    fps?: number;                     // Animation framerate (default 30)
    tracks: Track[];                  // Animation tracks
  };
  interactions?: Interaction[];       // Optional: hover, click, pointer triggers
}
```

### Critical Rules for AI Agents
1. **Layer Hierarchy:** In `scene.objects`, index `0` is **drawn in front** (closest to the viewer). Subsequent array indices are drawn behind, exactly like layers in Illustrator or Figma.
2. **Unique Identifiers (`id`):** Every node and every modifier inside a `stack` must have a globally unique string `id`. Animation tracks and interactions bind to elements via these IDs.
3. **Coordinate System:**
   - **Y increases downwards.**
   - Rotations are in **degrees clockwise**.
   - `transform.x` and `transform.y` are in pixels relative to the document centre.
4. **Fractions vs Pixels:**
   - Anchor and center parameters (e.g. `center: [0.5, 0.5]`, `pivot: [0.5, 0.5]`) use normalized fractions where `[0.5, 0.5]` is the exact centre of the node's bounding box.
   - Spatial parameters with unit `fraction` (such as `radius: 0.6` in Spherize or Twist) are relative to the bounding box dimension.
5. **Filters & Masks Run Last:** Modifiers of kind `filter` (`shadow`, `blur`, `glow`, `grain`, `displace`, `bevel`, `thicken`, `tone`) and `mask` are applied natively by SVG **after the full geometry stack has evaluated**, regardless of where they sit in the `stack` array.
6. **Expressions:** Supported numeric parameters, including effect seeds, may use `{ "$expr": "...", "fallback": 12 }` instead of a number. Expressions are evaluated per frame with `scene.time` in seconds, `scene.frame`, `scene.fps` (30 by default), `scene.duration`, `scene.progress`, `scene.seedGenerator` (the scene-wide random seed, 1 by default), `scene.width` and `scene.height` (the document's size; 0 when the scene has no fixed document; a nested composition reads its own), `scene.aspect` (width / height, 0 without a document), `scene.dt` (seconds since the previous frame; 1 / fps in renders), `scene.scroll` (0–1, host page scroll), `scene.pixelRatio` and `scene.clock.hour` / `minute` / `second` (real local time with fractional seconds; the players supply them, renders and exports see neutral values so they stay reproducible), the live pointer `scene.mouse.posX`, `posY` (scene coordinates in px), `fracX`, `fracY` (0–1 across the viewBox), `down`, `inside` (0/1), `rightDown`, `middleDown`, `clicks` (primary clicks so far), `clickMs` (ms since the last, 0 before any), `wheel` (accumulated: 1 per 100 px of deltaY, positive = down), `velX`, `velY` (px/s, smoothed; 0 once it stops) and `downMs` (ms the primary button has been held; after release, the length of the last press, 0 before any; Mouse Instance formulas see all of these at the input event); fed by the players, neutral in headless renders; a nested composition sees the parent's values as they are), and custom document variables such as `scene.custom.density`. Custom variables can be numbers or expressions that reference other custom variables; dependencies are resolved automatically and cycles use the stored fallback values. Variables are scoped to their scene, so nested compositions use their own variables. The safe math language supports `min`, `max`, `clamp`, `lerp`, `sin`, `cos`, `tan`, `abs`, `round`, `floor`, `ceil`, `sqrt`, `pow`, `atan`, `atan2`, `deg` (radians to degrees), `pi`, and `e`, plus `scene.countDown(seconds)`; it does not execute JavaScript. Shaping helpers: `map(x, inMin, inMax, outMin, outMax)` (unclamped), `mod(a, b)` (sign of b: `mod(-1, 3)` is 2, where `%` gives -1), `step(edge, x)` (0 below edge, 1 from it: a gate, since there are no comparisons), `smoothstep(a, b, x)`, `easeIn(t)` / `easeOut(t)` / `easeInOut(t)` (cubic, t clamped to 0–1), `pick(i, a, b, …)` (value at index i from 0, wrapping: `pick(mod(scene.mouse.clicks, 3), 10, 20, 40)` steps through them on each click) and `noise(x, seed?)` (smooth deterministic noise in −1…1, e.g. `40 * noise(scene.time)`; follows the document seed, the optional seed picks another curve). Followers: `smooth(x, seconds?)` eases towards x, reaching about 95% of a jump in `seconds` (0.3 by default); `spring(x, seconds?, bounce?)` follows x like a spring of that period (0.5 s) with bounce 0–1 (0.5; 0 never overshoots). Both remember the previous frame of the engine's frame-by-frame evaluation (players, editor, frame exports rendered in order with one engine), so `smooth(scene.mouse.posX, 0.4)` follows the pointer with lag. Without that memory (a single-frame render, looks at other times for trails or history, Mouse copies, nested compositions) they return x; a step back in time or a jump of more than a second restarts them at x. Text shape content also interpolates expressions inside braces, e.g. `{{scene.time}}` or `{{scene.countDown(10)}}`; use `{{fixed(scene.time, 2)}}` to keep exactly two decimal places, optionally zero-padding the integer part with `{{fixed(scene.time, 2, 2)}}`. A numeric expression replaces keyframes on the same parameter. Render-time measurements are machine-dependent diagnostics and are not available to expressions.

### Props and Children expressions

Numeric formulas in a node can read `props.name`. A child receives the direct parent’s native numeric values (shape parameters, transform and opacity) plus custom props explicitly declared on ancestors. Native values are local to the direct parent; they are not implicitly forwarded from a grandparent. To forward or rename one, add a custom prop on the intermediate parent, for example `{ "$expr": "props.rotation", "fallback": 0 }` under `props.inheritedRotation`. Custom props flow to descendants and may be overridden lower in the hierarchy.

A parent can read a numeric value from a direct child with `children["child-id"].property`, for example `children["shape-1"].rotation`. The child ID is a string, so hyphens are safe. Child references are read-only and direct-child only; use custom props to forward values across levels. Missing or unresolved references use the expression fallback. The editor’s **Props** section shows incoming values and lets you define custom numeric props, including formulas.

### Each: per-element formulas

**Each** (`type: "each"`, Effect menu) is an effector like Step: the effects nested in it apply to every element separately (Clone copies, letters, Mosaic tiles…), and their numeric formulas can read the element being processed: `element.index` (from 0), `element.count`, `element.row` and `element.column` (Clone grid, from 0), `element.u` and `element.v` (place across the grid, 0–1; along the elements outside a grid), `element.distance` (0 at the centre of the elements, 1 for the furthest) and `element.random` (a fixed 0–1 number per element; Each's Random seed varies it), plus everything else formulas read (`scene.*`, `props.*`, math). `element.*` is only available inside Each.

A **Shape** (`type: "shapevalues"`) nested in Each rebuilds every copy of a shape object with other values for the shape's own numeric parameters, by their scene names. It needs copies a Clone placed, so put Each right after the Clone.

```json
{ "kind": "shape", "id": "donut", "name": "Donut", "shape": "donut",
  "params": { "radius": 26, "innerRadius": 19, "fill": true },
  "stack": [
    { "id": "grid", "type": "clone", "params": { "mode": "grid", "columns": 21, "rows": 14 } },
    { "id": "each-1", "type": "each", "params": { "seed": 1 }, "children": [
      { "id": "shape-1", "type": "shapevalues", "params": { "innerRadius": { "$expr": "19 * (1 - element.distance)", "fallback": 19 } } },
      { "id": "turn-1", "type": "transform", "params": { "rotation": { "$expr": "360 * element.random", "fallback": 0 } } }
    ] }
  ] }
```

Validation warns about a Shape outside Each, on something that is not a shape object, or with names that are not numeric parameters of the shape. Scenes saved by 0.0.8 with a node-level `each` are converted to Each › Shape when the editor opens them.


---

## 4. Node Types (`SceneNode`)

Every node in `objects` includes:
- `id`: Unique string.
- `name`: Human-readable label.
- `stack`: Array of `ModifierInstance[]`.
- `transform`: `{ x?: number, y?: number, scale?: number, rotation?: number, flipX?: boolean, flipY?: boolean, pivot?: [fx, fy] }`.
- `opacity`: Number between `0` (transparent) and `1` (opaque).
- `blend`: CSS blend mode (`"normal"`, `"multiply"`, `"screen"`, `"overlay"`, `"darken"`, `"lighten"`, `"color-dodge"`, `"color-burn"`, `"hard-light"`, `"soft-light"`, `"difference"`, `"exclusion"`, `"hue"`, `"saturation"`, `"color"`, `"luminosity"`).
- `visible`: Boolean flag (`true`/`false`).

### Node Kinds

| `kind` | Additional Properties | Description |
|---|---|---|
| `shape` | `shape: string`, `params: Record<string, unknown>` | Parametric vector primitive (`rectangle`, `ellipse`, `polygon`, `star`, `line`, `spiral`, `text`, `cross`, `pawn`). |
| `object` | `source: string`, `href?: string` | Raw SVG string imported directly (`<svg viewBox="...">...</svg>`). With `href` and an empty `source`, the SVG lives outside the project (see below). |
| `group` | `children: SceneNode[]`, `layer?: boolean` | Container for child nodes. The group's `stack` acts upon all children as individual elements. With `layer: true` it is a layer (see Layers). |
| `instance` | `of: string` | Dynamic live copy of another node (`of` specifies the target node `id`). Inherits source effects while adding its own independent transform and stacked modifiers. |
| `effector` | `targets: string[]`, `delay?: number` | Invisible utility node. Injects its own `stack` into each target node separately. `delay` (seconds) staggers the animation timing per target. A `field` in its stack measures in the scene instead: `center`, `width`, `height` and `distance` are fractions of the document (1000 × 1000 at the origin without one), shared by all targets, so objects outside the field are left alone. Targets inside transformed groups are measured in their group's coordinates. |

### Project files and external SVGs

The editor saves a project as JSON: `{ "svertik": "project", "version": 1, "name", "canvas"?, "script", "embedSources"?, "scene": SceneV1 }`. Every host also opens a bare SceneV1. By default imported SVGs are embedded in each object's `source`. With **Document → SVGs** off (`embedSources: false`), each object keeps `source: ""` and an `href`: a file name relative to the project (identical SVGs share one file; different ones never do, e.g. `logo.svg`, `logo-2.svg`).

- **CLI:** reads each `href` next to the project file and fails naming the missing file.
- **Player:** `loadScene(url)` fetches each `href` relative to the JSON's URL; inline `data-svertik-scene` resolves against the page.
- **Editor:** opening such a project asks for the missing SVGs (choose them or drop them on the canvas, matched by file name). Until then those objects draw nothing and validation warns.
- **API:** `detachSources(scene)` → `{ scene, files }`, `missingSources(scene)`, `attachSources(scene, files)`, `resolveSources(scene, read)`.

**Packs** (`kind: "object"` with `packed`) keep their `original` node so they can be unpacked. Its frozen result (`packed.geometry`) is derived from it, so saved projects, Copy JSON and share links leave it out; only the description is stored. Evaluation rebuilds it from the original (in its scope, without a playback time, as packing does) once per pack: `engine.evaluateDocument` and `createPlayer` do it automatically, the editor on open. A pack without `original` (exported code) keeps its geometry. API: `stripPackGeometry(scene)` (a copy for saving), `restorePacks(scene, evaluate)` (fills it in place), `hasMissingPacks(scene)`.

In the editor, **Pack** with several selected sibling objects creates a temporary folder and packs it in one undo step, preserving stack order. **Unpack** restores and selects its children in one step. This is stored as `packed.autoGrouped: true`, so it also works after saving and reopening. If effects, placement, display settings or animation were added to the pack, Unpack retains the folder to preserve those edits. Existing folders packed individually remain folders. Multi-selections across folders must first be moved into the same folder.


---

## 5. The "Elements" System (Pieces of Geometry)

Many advanced procedural effects operate on collections of **individual elements**:
- Text (`shape: "text"`): Each character/glyph is an individual element.
- Cloner (`clone`): Each duplicated copy is an element.
- Mosaic (`mosaic`): Each cut tile is an element.
- Fracture/Wear (`crack` in `"shatter"` mode, `damage`): Each broken shard is an element.
- Voronoi (`voronoi`): Each clipped cell is an element.
- Groups (`kind: "group"`): Each child node acts as an element.

**Rigid Pieces** (`rigidpieces`) marks each current element as a rigid plate. Place it after a generator such as Voronoi, Mosaic or Clone; nested deformers then apply independently to each piece using its own bounds. **Color, Tint, Opacity, Paint, Gradient, Image Fill** and **Feather** can also be nested to style each piece independently. Feather expands each piece's boundary; Mask remains outside because it applies to the whole object after its stack. Nested Transform and Transform 3D are deferred until a downstream deformer actually moves a piece; a neutral deformer or a piece outside its influence leaves them inactive. Transform 3D provides translation along camera Z and three-axis rotation, projected into apparent scale. **Amount** blends downstream deformation from normal point-by-point bending (0) to whole-piece rigid motion (1). **Pivot** is shared with nested Transform and Transform 3D, so it sets their rotation/scale anchor and the anchor for compatible downstream deformers such as Spherize, Twist, Bend, Wave, Ripple, Noise, Taper, Shear, Cylinder and Perspective. For example: `Voronoi → Rigid Pieces [Transform 3D] → Spherize`. This is a geometry behavior, not a physics simulation; Gravity and Physics still control falling and collisions.

The **Effector** modifiers (`step`, `stagger`, `range`, `field`, `explosion`, `color`) distribute procedural values across elements:
- `step`: Multiplies child modifier parameters by the element index (0, 1, 2...).
- `range`: Selects a sliding window of elements (e.g. animate a wave sweeping across characters).
- `field`: Attenuates child modifier strength according to where each element is relative to a geometric field (ellipse, plane, box). `contain` picks the test: `center` (default), `full` (entirely inside) or `partial` (touching).
- `explosion`: Propels elements outward from a blast centre with spin, displacement, and scaling.

> [!WARNING]
> Container effectors (`step`, `stagger`, `range`, `field`, `rgbsplit`) hold nested modifiers inside their `children` array. Selector effectors Range and Field can also contain the time-signal effectors Oscillate, Wiggle, Pulse and Shake, limiting those signals to the selected elements. Other effector nesting is not supported.

---

## 6. Geometric Primitives (`shapes`)

**Percent sizes.** Rectangle and Ellipse `width`/`height`, and Rectangle `radius` and its four corner radii, accept a percentage written as text, like CSS: `"width": "50%"`. A plain number is still px. Width is a percentage of the document width, height of the document height (1000 px when the scene has no fixed document), and a corner radius of half the shorter side (`"100%"` makes a pill or a circle). Percentages resolve to px before the shape is built, so effects see plain numbers. Two percentage keyframes interpolate as percentages; a px key next to a % key jumps. `validateScene` warns on a percentage where it is not accepted or on text that is not one. In the editor, click a field's unit (`px` / `%`) to switch: the value is converted, so the drawing stays the same.

Use **Image Fill** from the Style effects menu to paint a shape from a raster image object in the same document. Select that object in **Source**. **Hide source** is on by default: the raster remains available to the fill but is omitted from drawing and from a parent's physics input, so it cannot fall as a second body. Turn it off to show the source object. Choose Cover, Contain or Stretch, then adjust Scale and Position. Image Fill uses the original bounds of the stack as one shared frame, so Crack shards sample the matching region whether Image Fill is before or after Crack. Clone copies retain that image material, and Voronoi transfers it to each generated cell. The frame follows Gravity as pieces fall. SVG and Canvas rendering preserve image fills; Lottie export warns that it cannot.

<!-- generated:catalog:start -->

*Generated from the engine schemas by `pnpm svertik docs`; do not edit by hand. Each parameter: type (or options), default, range, unit and when it applies.*

All shapes share these style parameters:

- `fill`: boolean, default `true`, not animatable
- `fillColor` (**Fill color**): color, default `"#d9d9d9"`
- `stroke`: boolean, default `false`, not animatable
- `strokeColor` (**Stroke color**): color, default `"#ededed"`, only when `stroke` is `true`
- `strokeWidth` (**Stroke width**): number, default `2`, 0..400, px, only when `stroke` is `true`
- `strokeJoin` (**Join**): "miter" | "round" | "bevel", default `"round"`, not animatable, only when `stroke` is `true`
- `strokeCap` (**Cap**): "butt" | "round" | "square", default `"round"`, not animatable, only when `stroke` is `true`
- `dash`: number, default `0`, 0..400, px, only when `stroke` is `true`
- `gap`: number, default `0`, 0..400, px, only when `stroke` is `true`
- `dashOffset` (**Dash offset**): number, default `0`, -10000..10000, px, only when `stroke` is `true`
- `behind` (**Behind fill**): boolean, default `false`, not animatable, only when `stroke` is `true`

### Shape Registry

1. **`rectangle`** (Rectangle): A rectangle, with optional rounded corners. Each radius is capped at half the shorter side of the rectangle, then adjacent corners are scaled together if needed to fit.
   - `width`: number, default `160`, 1..∞, px
   - `height`: number, default `120`, 1..∞, px
   - `radius`: number, default `0`, 0..∞, px, only when `linkCorners` is `true`
   - `linkCorners` (**Link corners**): boolean, default `true`, not animatable
   - `radiusTopLeft` (**Top left**): number, default `0`, 0..∞, px, only when `linkCorners` is `false`
   - `radiusTopRight` (**Top right**): number, default `0`, 0..∞, px, only when `linkCorners` is `false`
   - `radiusBottomRight` (**Bottom right**): number, default `0`, 0..∞, px, only when `linkCorners` is `false`
   - `radiusBottomLeft` (**Bottom left**): number, default `0`, 0..∞, px, only when `linkCorners` is `false`
2. **`ellipse`** (Ellipse): An ellipse (a circle when width and height match).
   - `width`: number, default `140`, 1..∞, px
   - `height`: number, default `140`, 1..∞, px
3. **`donut`** (Donut): A ring: a circle of radius Outer with a round hole of radius Inner, both exact curves. Inner 0 (or not smaller than Outer) leaves a plain circle. Stretch the object for an elliptical ring.
   - `radius` (**Outer**): number, default `80`, 1..∞, px
   - `innerRadius` (**Inner**): number, default `45`, 0..∞, px
4. **`polygon`** (Polygon): A regular polygon with any number of sides.
   - `radius`: number, default `80`, 1..∞, px
   - `sides`: number, default `6`, 3..64
   - `rotation`: angle, default `0`
5. **`star`** (Star): A star with any number of points and an inner radius (2 points make a needle or a diamond).
   - `radius`: number, default `80`, 1..∞, px
   - `points`: number, default `5`, 2..64
   - `inner` (**Inner radius**): number, default `0.45`, 0.01..1
   - `rotation`: angle, default `0`
6. **`cross`** (Cross): A filled plus sign: Size controls the overall extent and Width the thickness of its arms, clamped to Size. Rotate the object 45 degrees for an X.
   - `size`: number, default `140`, 1..∞, px
   - `width`: number, default `28`, 1..∞, px
7. **`arrow`** (Arrow): A continuous arrow outline with independent Start head and End head selectors: none, triangular, V, square or round. Head / length sets the head length relative to the total; Head / body width controls its width. V depth controls the chevron notch. Numeric proportions can be animated.
   - `length`: number, default `240`, 1..∞, px
   - `width` (**Body width**): number, default `24`, 1..∞, px
   - `startHead` (**Start head**): "none" | "triangle" | "v" | "square" | "circle", default `"none"`, not animatable
   - `endHead` (**End head**): "none" | "triangle" | "v" | "square" | "circle", default `"triangle"`, not animatable
   - `headLength` (**Head / length**): number, default `0.28`, 0.01..0.5, fraction
   - `headWidth` (**Head / body width**): number, default `3`, 1..12
   - `notch` (**V depth**): number, default `0.45`, 0..0.9, fraction
8. **`line`** (Line): A straight line, by length and angle. Stroke only by default.
   - `length`: number, default `200`, 1..∞, px
   - `angle`: angle, default `0`
9. **`spiral`** (Spiral): An Archimedean spiral, by radius and number of turns. Stroke only by default.
   - `radius`: number, default `90`, 1..∞, px
   - `turns`: number, default `4`, 0.25..30
10. **`text`** (Text): Text turned into outlines, one piece per letter (so Step, Stagger and Range can treat letters, words and lines separately). Uses the registered fonts.
   - `text`: text, default `"svertik"`
   - `updateRate` (**Update rate**): number, default `12`, 1..60, Hz, not animatable
   - `font`: font, default `"Commit Mono"`
   - `weight`: number, default `400`, 100..900, not animatable
   - `italic`: boolean, default `false`, not animatable
   - `size`: number, default `72`, 1..∞, px
   - `tracking`: number, default `0`, -500..2000
   - `lineHeight` (**Line height**): number, default `1.2`, 0.5..4
   - `align`: "left" | "center" | "right", default `"center"`, not animatable
   - `anchor`: "ink" | "left" | "center" | "right", default `"ink"`, not animatable
11. **`path`** (Path): An editable source path with open or closed cubic Bézier contours. Anchors have independent, smooth or symmetric handles. Coordinates stay in local pixels, so moving points preserves the source origin and the procedural effect stack.
   - `contours`: path, default `[{"closed":false,"points":[{"point":[-100,50],"in":[0,0],"out":[0,0],"mode":"corner"},{"point":[0,-50],"in":[-40,0],"out":[40,0],"mode":"symmetric"},{"point":[100,50],"in":[0,0],"out":[0,0],"mode":"corner"}]}]`, not animatable
12. **`pawn`** (Pawn): A chess pawn: svertik's test shape, with curves and straight parts.
   - `height`: number, default `200`, 1..∞, px

## 7. Complete Modifier Catalog

Every built-in effect, by kind. The pages in `packages/engine/docs/reference/` carry the same with a JSON snippet each; longer notes on some effects follow in the sections after the catalog.

### 7.1 Deformers (`kind: "deformer"`): move the points of the drawing

1. **`transform`** (Transform, menu Deform): Moves, rotates and scales the whole drawing, around a pivot. Offsets are in drawing units (px).
   - `x`: number, default `0`, px
   - `y`: number, default `0`, px
   - `rotation`: angle, default `0`
   - `scale`: number, default `1`, 0..∞
   - `pivot`: point, default `[0.5,0.5]`, fraction
2. **`rotate3d`** (Transform 3D, menu Deform): Moves and rotates the drawing in 3D around a pivot, then projects it onto 2D with perspective. Positive Translate Z moves it toward the viewer and makes it appear larger; negative values move it farther away. X/Y tilt and Z spins the drawing.
   - `rotateX` (**Tilt X**): angle, default `30`
   - `rotateY` (**Tilt Y**): angle, default `0`
   - `rotateZ` (**Spin Z**): angle, default `0`
   - `translateZ` (**Translate Z**): number, default `0`, px
   - `perspective`: number, default `2`, 0.5..10, fraction
   - `pivot`: point, default `[0.5,0.5]`, fraction
3. **`spherize`** (Spherize, menu Deform): Bulges (strength > 0) or pinches (strength < 0) what falls inside a circle. The edge of the circle does not move, so there is no jump with what is outside. After Rigid Pieces, each marked element moves and turns as a plate instead of bending.
   - `center`: point, default `[0.5,0.5]`, fraction
   - `radius`: number, default `0.5`, 0..2, fraction
   - `strength`: number, default `0.5`, -1..1
4. **`twist`** (Twist, menu Deform): A whirl: turns more the closer a point is to the center, and nothing at the edge of the radius.
   - `center`: point, default `[0.5,0.5]`, fraction
   - `radius`: number, default `0.6`, 0..2, fraction
   - `angle`: angle, default `90`
5. **`bend`** (Bend, menu Deform): Curves the drawing like a sheet: the chosen axis becomes an arc of `angle` degrees. Positive angles bend the ends down (∩), negative ones up (∪).
   - `angle`: angle, default `90`
   - `axis`: "horizontal" | "vertical", default `"horizontal"`, not animatable
6. **`bones`** (Bones, menu Deform): A chain of 2 to 6 equal bones from Start to End. Each bone turns on its joint (relative to the previous one) and drags what is around it, with a smooth transition at each joint. With a Target, the angles are solved (IK) so the tip reaches it.
   - `segments`: number, default `3`, 2..6
   - `angle1` (**Bone 1**): angle, default `12`, only when `ik` is `false`
   - `angle2` (**Bone 2**): angle, default `12`, only when `ik` is `false`
   - `angle3` (**Bone 3**): angle, default `12`, only when `ik` is `false` and `segments` is `3` or `4` or `5` or `6`
   - `angle4` (**Bone 4**): angle, default `12`, only when `ik` is `false` and `segments` is `4` or `5` or `6`
   - `angle5` (**Bone 5**): angle, default `12`, only when `ik` is `false` and `segments` is `5` or `6`
   - `angle6` (**Bone 6**): angle, default `12`, only when `ik` is `false` and `segments` is `6`
   - `smooth`: number, default `0.5`, 0..1
   - `ik`: boolean, default `false`, not animatable
   - `target`: point, default `[0.8,0.1]`, fraction, only when `ik` is `true`
   - `start`: point, default `[0,0.5]`, fraction
   - `end`: point, default `[1,0.5]`, fraction
7. **`taper`** (Taper, menu Deform): Narrows (or widens) one end: the width across the axis changes along it.
   - `amount`: number, default `0.5`, -1..1
   - `curve`: number, default `0`, -1..1
   - `axis`: "vertical" | "horizontal", default `"vertical"`, not animatable
8. **`gather`** (Gather, menu Deform): Squeezes the drawing towards one side along an axis, by an amount that changes across it: Start applies at one edge (top for axis x, left for axis y), End at the other, positive towards the left/top and negative towards the right/bottom. Straight lines across the axis stay straight, so a row of bars becomes a fan whose spacing drifts (weaves, moiré, fake perspective). Strokes keep their width.
   - `axis`: "x" | "y", default `"x"`, not animatable
   - `start`: number, default `0.5`, -0.99..0.99
   - `end`: number, default `-0.5`, -0.99..0.99
9. **`compress`** (Compress, menu Deform): Crowds the drawing towards a center line along one axis (Strength > 0) or spreads it away from it (Strength < 0); both ends of the box stay put and the order of points is kept. The center goes from Start at one edge (top for axis x, left for axis y) to End at the other (fractions across the axis). With Rigid Pieces first, evenly spaced marks keep their shape and pile into a solid bar at the center, so a Clone grid gets a dense band that can sweep diagonally row by row.
   - `axis`: "x" | "y", default `"x"`, not animatable
   - `start`: number, default `0.5`, 0..1, fraction
   - `end`: number, default `0.5`, 0..1, fraction
   - `strength`: number, default `0.7`, -1..1
10. **`rope`** (Rope, menu Motion): Open paths hang as ropes pinned at both ends: a Verlet chain with the drawn length, Gravity, Wind and Damping, that settles and swings. Pointer and Radius place a round obstacle that pushes the ropes out of its way (bind Pointer to the cursor with `scene.mouse` formulas, Space set to Scene). Time follows scene.time unless it is set; keep Rope first in the stack, as it keeps its state between frames. Closed paths are left alone.
   - `time` (**Time (s)**): number, default `scene.time` (ƒx; `0` as fallback), 0..100000
   - `gravity`: number, default `1`, 0..10, fraction
   - `wind`: number, default `0`, 0..5
   - `damping`: number, default `0.8`, 0..20
   - `stiffness`: number, default `14`, 1..60, not animatable
   - `segments`: number, default `24`, 4..120, not animatable
   - `pointer`: point, default `[-2,-2]`, fraction
   - `space` (**Pointer in**): "box" | "scene", default `"box"`, not animatable
   - `radius`: number, default `0`, 0..1, fraction
   - `settle` (**Settle (s)**): number, default `0`, 0..10, s, not animatable
   - `seed`: seed, default `1`
11. **`shear`** (Shear, menu Deform): Slants the drawing: X shifts with the height and Y with the width, around the center.
   - `x` (**Shear X**): angle, default `20`
   - `y` (**Shear Y**): angle, default `0`
12. **`wave`** (Wave, menu Deform): Makes the drawing wavy: moves each point across the direction of the wave.
   - `amplitude`: number, default `0.05`, 0..0.5, fraction
   - `wavelength`: number, default `0.5`, 0.01..2, fraction
   - `phase`: angle, default `0`
   - `direction`: angle, default `0`
13. **`ripple`** (Ripple, menu Deform): Concentric waves from a point, like a drop in water; they fade with the distance.
   - `amplitude`: number, default `0.03`, 0..0.2, fraction
   - `wavelength`: number, default `0.15`, 0.02..1, fraction
   - `phase`: angle, default `0`
   - `decay`: number, default `1`, 0..5
   - `center`: point, default `[0.5,0.5]`, fraction
14. **`noise`** (Noise, menu Deform): Moves each point with smooth noise: an organic, hand-drawn look.
   - `amount`: number, default `0.03`, 0..∞, fraction
   - `scale` (**Frequency**): number, default `4`, 0.1..∞
   - `evolution`: number, default `0`
   - `seed`: seed, default `1`
15. **`roughen`** (Roughen, menu Deform): Fractal edges on any drawing: `organic` tears the outline (midpoint displacement, like a coastline or torn paper); `koch` turns each segment into a Koch peak, `iterations` times. Curves become straight segments.
   - `mode`: "organic" | "koch", default `"organic"`, not animatable
   - `amount`: number, default `0.5`, 0..1
   - `detail`: number, default `0.02`, 0.004..0.2, fraction
   - `seed`: seed, default `1`
   - `iterations`: number, default `2`, 1..4
   - `height` (**Peak**): number, default `0.29`, -0.6..0.6
16. **`roundcorners`** (Round Corners, menu Deform): Rounds the corners: wherever the path changes direction sharply, it cuts both segments and joins them with an arc of `radius` px (or a straight cut, `chamfer`). A corner radius is capped at half the length of either adjoining side. Smooth curves are left alone; `limit` keeps corners wider than that angle. Set Corners to Random to choose a stable seeded subset independently for each clone.
   - `radius`: number, default `12`, 0..500, px
   - `limit` (**Angle limit**): number, default `180`, 0..180, °
   - `shape`: "round" | "chamfer", default `"round"`, not animatable
   - `corners`: "all" | "random", default `"all"`, not animatable
   - `seed`: seed, default `1`
17. **`blob`** (Blob, menu Deform): Turns every outline into a blob: a smooth closed curve with no straight sides or corners. Inset first pulls the outline inwards (px; negative grows it), which on touching cells such as Voronoi or Mosaic opens the gaps between them; a cell smaller than the inset disappears. Roundness sets how much of each side the corners take: 0 keeps the polygon, 1 is a tangent-continuous curve through the middle of every side. Curved input is sampled first, so circles stay round and straight sides keep their real corners. Open paths keep their ends. Stack Noise or Displace after it for an irregular, organic edge.
   - `roundness`: number, default `1`, 0..1
   - `inset`: number, default `0`, -100..200, px
18. **`spikes`** (Spikes, menu Deform): Regular spikes along the outline: `count` tips per path, evenly spaced, `height` px out (negative: inwards). `curve` shapes the sides: 0 straight, towards 1 hollow like thorns, towards -1 bulging like petals. `width` leaves outline between spikes, `lean` tilts the tips and `phase` slides them along.
   - `count`: number, default `12`, 1..200
   - `height`: number, default `30`, -500..500, px
   - `curve`: number, default `0`, -1..1
   - `width`: number, default `1`, 0.05..1, fraction
   - `lean`: number, default `0`, -1..1
   - `phase`: number, default `0`, 0..1, fraction
19. **`melt`** (Melt, menu Deform): The drawing drips downwards, more the lower it is; noise decides where the drops fall.
   - `amount`: number, default `0.25`, 0..1, fraction
   - `drips`: number, default `6`, 1..30
   - `sharpness`: number, default `2`, 0.5..6
   - `seed`: seed, default `1`
20. **`cylinder`** (Cylinder, menu Deform): Wraps the drawing around a vertical cylinder (like the label of a can). `wrap` is the part of the turn the drawing covers; the sides compress and move closer or away.
   - `wrap`: number, default `0.5`, 0.01..1
   - `rotation`: angle, default `0`
   - `perspective`: number, default `0.15`, 0..1
21. **`perspective`** (Perspective, menu Deform): Free perspective: each corner of the drawing goes where you drag its handle.
   - `topLeft` (**Top left**): point, default `[0.1,0]`, fraction
   - `topRight` (**Top right**): point, default `[0.9,0]`, fraction
   - `bottomRight` (**Bottom right**): point, default `[1,1]`, fraction
   - `bottomLeft` (**Bottom left**): point, default `[0,1]`, fraction
22. **`envelope`** (Envelope, menu Deform): Envelope distortion: drag the nine points of the mesh and the drawing bends with it.
   - `p00` (**Top left**): point, default `[0,0]`, fraction
   - `p10` (**Top**): point, default `[0.5,0]`, fraction
   - `p20` (**Top right**): point, default `[1,0]`, fraction
   - `p01` (**Left**): point, default `[0,0.5]`, fraction
   - `p11` (**Middle**): point, default `[0.5,0.5]`, fraction
   - `p21` (**Right**): point, default `[1,0.5]`, fraction
   - `p02` (**Bottom left**): point, default `[0,1]`, fraction
   - `p12` (**Bottom**): point, default `[0.5,1]`, fraction
   - `p22` (**Bottom right**): point, default `[1,1]`, fraction
23. **`pathwrap`** (Path Wrap, menu Deform): Wraps the drawing along another object's path (its longest one). The drawing's axis follows the path; what is across it moves away from it. `stretch` fills the whole path; `keep` keeps its length and starts at `offset`.
   - `target` (**Path**): node, default `""`
   - `axis`: "horizontal" | "vertical", default `"horizontal"`, not animatable
   - `fit`: "stretch" | "keep", default `"stretch"`, not animatable
   - `offset`: number, default `0`, -1..1, fraction
24. **`followpath`** (Follow Path, menu Motion): Moves the whole object, without bending it, to a point on another object's path: `position` is the fraction of the way (0 start, 1 end; closed paths loop). `anchor` is the point of the object that sits on the path; `orient` turns it with the path.
   - `target` (**Path**): node, default `""`
   - `position`: number, default `0`, 0..1
   - `orient`: boolean, default `true`
   - `angle`: angle, default `0`
   - `offset`: number, default `0`, -500..500, px
   - `anchor`: point, default `[0.5,0.5]`, fraction
25. **`lookat`** (Look At, menu Motion): Turns the object so that it faces another one (its center), around `pivot`. `facing` says which side is the front (0 right, -90 up, 90 down, 180 left); `amount`, how much it turns. If the other moves, it keeps looking.
   - `target`: node, default `""`
   - `facing`: angle, default `0`
   - `amount`: number, default `1`, 0..1
   - `pivot`: point, default `[0.5,0.5]`, fraction
26. **`morph`** (Morph, menu Deform): Morphs this drawing into another object's shape. Paths are paired (largest with largest), resampled to the same number of points and interpolated; extra paths grow from (or shrink to) a point. Fill and stroke blend too. With `steps`, the in-between shapes as separate elements.
   - `target` (**To**): node, default `""`
   - `amount`: number, default `0.5`, 0..1
   - `points`: number, default `200`, 16..1000
   - `colors` (**Blend colors**): boolean, default `true`, not animatable
   - `steps`: number, default `0`, 0..100
27. **`trim`** (Trim, menu Deform): Trims paths (draws them): only the part of each path between Start and End (fractions of its length) remains, shifted by Offset; closed paths wrap around. Animate End from 0 to 1 and the stroke draws itself.
   - `start`: number, default `0`, 0..1
   - `end`: number, default `0.5`, 0..1
   - `offset`: number, default `0`, -1..1
28. **`shapevalues`** (Shape, menu Effect): Only inside Each, on a shape object after a Clone: rebuilds every copy with other values for the shape's own parameters, by name, usually formulas with element.* (Inner = 19 * (1 - element.distance) closes the holes of a donut grid towards the edges). The new copy keeps its place and style.
29. **`softbody`** (Soft Body, menu Motion): Elastic material for open fibres and closed bodies. Stiffness, Bending, Keep area, Damping and Recovery define deformation and recovery; fibres may be free or pinned. Body model defaults to Outline; Beam adds a flexible internal spine and cross-sections that carry a broad bend through a closed, elongated body, then recover toward its rigid rest shape as impacts settle. Recovery controls how strongly it returns once internal motion dies down; Bounce and floor contacts still come from Gravity or Physics. Changes no geometry by itself. Apply to chooses both, fibres only or closed bodies only.
   - `mode` (**Apply to**): "auto" | "fibers" | "bodies", default `"auto"`, not animatable
   - `body` (**Body model**): "outline" | "beam", default `"outline"`, not animatable
   - `stiffness`: number, default `0.8`, 0..1
   - `bending`: number, default `0.15`, 0..1
   - `volume` (**Keep area**): number, default `0.9`, 0..1
   - `damping`: number, default `0.4`, 0..1
   - `recovery`: number, default `10`, 0..100
   - `pins` (**Pin fibers**): "free" | "start" | "ends", default `"free"`, not animatable
   - `segments` (**Resolution**): number, default `24`, 4..64, not animatable
30. **`rigidbody`** (Rigid Body, menu Motion): How a child of a Physics group (or of an object with Gravity) starts: initial Velocity and Spin, Immovable to make it a fixed collider, and the Mass center (Auto uses the geometry's; Custom moves it with a handle, changing how the body turns and rests). Attractor pulls the other rigid bodies towards the nearest point of its solid geometry with an inverse-square field (holes kept): Strength and Range are relative to the largest body, moving or fixed; the reaction moves the attractor unless it is Immovable. Absorption reduces bounce and damps motion on impact while keeping the approach speed, and Settle zeroes residual motion below a speed, so bodies rebound a few times and come to rest.
   - `velocity`: point, default `[0,0]`, px
   - `spin`: number, default `0`, °/s
   - `immovable`: boolean, default `false`
   - `centerOfMassMode` (**Mass center**): "auto" | "custom", default `"auto"`
   - `centerOfMass` (**Position**): point, default `[0.5,0.5]`, fraction, only when `centerOfMassMode` is `custom`
   - `attractor`: boolean, default `false`
   - `attractionStrength` (**Strength**): number, default `1`, 0..10, fraction
   - `attractionRange` (**Range**): number, default `0`, 0..10, fraction
   - `attractionAbsorption` (**Absorption**): number, default `0.5`, 0..1, fraction
   - `attractionSleepThreshold` (**Settle**): number, default `0.03`, 0..0.2, fraction

### 7.2 Generators (`kind: "generator"`): make new geometry (copies, pieces, marks…)

1. **`flowfield`** (Flow Field, menu Draw): Seeds smooth vector streamlines inside the input silhouette and integrates them through a deterministic noise-driven direction field. Lines stops the field work at a bounded count; Length, Step, Field scale, Curl and Direction shape the paths, and Seed reproduces the same flow.
   - `lines`: number, default `56`, 1..256
   - `length`: number, default `320`, 20..2400, px
   - `step`: number, default `4`, 0.5..20, px, not animatable
   - `scale` (**Field scale**): number, default `3`, 0.1..20
   - `curl`: number, default `1.2`, 0..2
   - `direction`: angle, default `0`
   - `seed`: seed, default `1`
2. **`wavelines`** (Wave Lines, menu Draw): Turns sampled tone into horizontal vector lines. Darkness shapes each line’s offset and weight; Line spacing, Sample spacing, Wave amount and Wavelength control the texture. Speed moves the wave over Time, which follows scene.time unless it is set. Lines stay within the sampled silhouette; use Color or Tint after Wave Lines to style them.
   - `spacing` (**Line spacing**): number, default `12`, 2..120, px
   - `resolution` (**Sample spacing**): number, default `6`, 1..40, px
   - `amplitude` (**Wave amount**): number, default `22`, 0..160, px
   - `wavelength`: number, default `180`, 12..1200, px
   - `width` (**Line width**): number, default `1.4`, 0.1..12, px
   - `weight` (**Tone weight**): number, default `0.8`, 0..1
   - `gamma`: number, default `1`, 0.1..4
   - `invert`: boolean, default `false`
   - `time`: number, default `scene.time` (ƒx; `0` as fallback), 0..3600, s
   - `speed`: number, default `0.35`, -4..4, Hz
3. **`connect`** (Connect, menu Draw): Joins two objects with a line that follows them: the drawing becomes the stretch from `from` to `to` (their anchors, fractions of their box), keeping its style. Straight, arc, horizontal or vertical; from edge to edge with a `gap`; optional arrowheads. Utils → Connector creates it.
   - `from`: node, default `""`
   - `to`: node, default `""`
   - `shape`: "straight" | "arc" | "horizontal" | "vertical", default `"straight"`, not animatable
   - `bend`: number, default `0.3`, -2..2
   - `edges`: boolean, default `true`
   - `gap`: number, default `6`, 0..200, px
   - `arrow`: "none" | "end" | "start" | "both", default `"none"`, not animatable
   - `arrowSize` (**Arrow size**): number, default `10`, 1..100, px, only when `arrow` is `end` or `start` or `both`
   - `fromAnchor` (**From anchor**): point, default `[0.5,0.5]`, fraction
   - `toAnchor` (**To anchor**): point, default `[0.5,0.5]`, fraction
4. **`network`** (Network, menu Draw): Draws elastic links between each shape and its nearest neighbours while leaving the source shapes in place. Links stay attached under Explosion, Gravity and Physics, sag with slack, and break when stretched past their resistance. Neighbour count, distance and link width are adjustable; links inherit the source colour, which Color or Tint can change after Network.
   - `neighbors`: number, default `2`, 1..8
   - `maxDistance` (**Max distance**): number, default `180`, 0..1200, px
   - `gap` (**Edge gap**): number, default `2`, 0..100, px
   - `elasticity`: number, default `0.35`, 0..1
   - `resistance`: number, default `3`, 1..8
   - `width` (**Link width**): number, default `1.5`, 0.1..24, px
5. **`weave`** (Weave, menu Draw): At every crossing between open stroked paths, alternates which path passes over and cuts a small gap into the path underneath. Use it on linework such as two cloned grids; it keeps the source elements editable.
   - `gap`: number, default `12`, 0..120, px
   - `samples` (**Curve detail**): number, default `10`, 4..24, not animatable
6. **`stringart`** (String Art, menu Draw): Samples evenly spaced points around each closed contour and connects each point to another a fixed number of steps ahead, drawing a modular chord pattern as editable vector lines. Points controls the sampling resolution, Skip changes the star pattern and Phase shifts where sampling begins.
   - `points`: number, default `120`, 8..256
   - `skip`: number, default `37`, 1..255
   - `phase`: angle, default `0`
7. **`spirograph`** (Spirograph, menu Draw): Draws a closed rolling-gear curve inside the input bounds. Hypo rolls a wheel inside a ring; Epi rolls it outside. Ring teeth and Wheel teeth determine the gear ratio, Pen offset moves the drawing point away from the wheel centre, and Detail controls curve resolution.
   - `mode` (**Gear**): "hypo" | "epi", default `"hypo"`, not animatable
   - `ring` (**Ring teeth**): number, default `84`, 12..160
   - `wheel` (**Wheel teeth**): number, default `23`, 2..80
   - `pen` (**Pen offset**): number, default `0.82`, 0..2
   - `phase`: angle, default `0`
   - `detail`: number, default `1800`, 120..4096, not animatable
8. **`trace`** (Trace, menu Draw): A trail: the drawing becomes the path another object's center followed during the last `length` seconds of the animation, keeping its style. Shown while playing or scrubbing. Utils → Tracer creates it.
   - `target` (**Object**): node, default `""`
   - `length`: number, default `1`, 0.05..20, s
   - `samples`: number, default `40`, 2..240, not animatable
   - `smooth`: boolean, default `true`
9. **`crack`** (Crack, menu Deform): Fractures filled shapes with either branching cracks from an impact or edge-to-edge slices. In Impact pattern, Spread controls where side branches form: lower values strongly concentrate them near the impact without reducing their expected count; 1 distributes them evenly along the cracks. `cut` cuts lines as gaps of `width` px; `shatter` cuts them into elements and pushes the loose pieces apart. Separation sets the distance and Variation controls how much that distance differs between pieces, deterministically from the seed.
   - `mode`: "cut" | "shatter", default `"cut"`, not animatable
   - `pattern`: "impact" | "slices", default `"impact"`, not animatable
   - `growth`: number, default `1`, 0..1
   - `cracks`: number, default `5`, 1..16, only when `pattern` is `impact`
   - `length`: number, default `0.6`, 0..2, fraction, only when `pattern` is `impact`
   - `branching`: number, default `0.35`, 0..1, only when `pattern` is `impact`
   - `spread`: number, default `1`, 0..1, only when `pattern` is `impact`
   - `jagged`: number, default `0.4`, 0..1, only when `pattern` is `impact`
   - `width`: number, default `1`, 0..10, px
   - `separation`: number, default `6`, 0..80, px, only when `mode` is `shatter`
   - `variation`: number, default `0.4`, 0..1, only when `mode` is `shatter`
   - `slices` (**Count**): number, default `5`, 1..16, only when `pattern` is `slices`
   - `angle`: angle, default `0`, only when `pattern` is `slices`
   - `angleVariation` (**Variation**): angle, default `24`, only when `pattern` is `slices`
   - `impact` (**Point**): point, default `[0.4,0.35]`, fraction, only when `pattern` is `impact`
   - `seed`: seed, default `1`
10. **`radialcut`** (Radial Cut, menu Deform): Cuts filled shapes into radial sectors like slices of a cake. Count controls the number of pieces. Offset rotates the whole cut. Spin progressively rotates each sector around its own centre to create a pinwheel or spiral. Drag Center to move the pivot. Separation pulls each sector outward from that point.
   - `count`: number, default `8`, 2..72
   - `angleOffset` (**Offset**): angle, default `0`
   - `spin`: angle, default `0`
   - `separation`: number, default `0`, 0..100, px
   - `center`: point, default `[0.5,0.5]`, fraction
11. **`damage`** (Damage, menu Deform): Wear: cracks coming in from the edges, chips on the edge and specks, cut as holes. Everything comes from a seed; `growth` makes the cracks advance. Surfaces only.
   - `seed`: seed, default `1`
   - `growth`: number, default `1`, 0..1
   - `roughness`: number, default `0.5`, 0..1
   - `cracks` (**Count**): number, default `3`, 0..12
   - `through`: number, default `0`, 0..8
   - `length`: number, default `0.55`, 0.05..1.5, fraction
   - `width`: number, default `0.012`, 0.001..0.06, fraction
   - `jagged`: number, default `0.5`, 0..1
   - `taper`: number, default `0.75`, 0..1
   - `chips` (**Count**): number, default `4`, 0..30
   - `chipSize` (**Size**): number, default `0.035`, 0.005..0.15, fraction
   - `specks` (**Count**): number, default `30`, 0..300
   - `speckSize` (**Size**): number, default `0.006`, 0.001..0.03, fraction
   - `edgeBias` (**Near edges**): number, default `0.7`, 0..1
12. **`clone`** (Clone, menu Repeat): Duplicates the drawing in a grid, concentric rings or a line, around the original. Grid can pack 2×2 large copies by reserving their cells, so the copies do not overlap; Gap sets the clear space between cells, Big / normal sets their share and Seed shuffles their placement. In Radial, Count copies are placed on each of Rings circles; Ring spacing controls the distance between radii. In `object` mode, on another object: along its outline, on its vertices or inside it (random, with a seed). Each copy is an element. Fill keeps a share of the grid cells (a 2×2 copy counts as four): at random with Fill direction 0, or growing from the side Fill angle points to (90° is the bottom) towards 1, with a ragged edge; Fill seed varies it.
   - `mode`: "grid" | "radial" | "linear" | "object", default `"grid"`, not animatable
   - `count`: number, default `6`, 1..256, only when `mode` is `radial` or `linear` or `object`
   - `columns`: number, default `3`, 1..256
   - `rows`: number, default `3`, 1..256
   - `spacing`: point, default `[1.1,1.1]`, fraction, only when `packLarge` is `off`
   - `packLarge` (**Pack large copies**): "off" | "2x2", default `"off"`, not animatable
   - `largeRatio` (**Big / normal**): number, default `0.16`, 0..0.5, only when `packLarge` is `2x2`
   - `gridSeed` (**Seed**): seed, default `1`, only when `packLarge` is `2x2`
   - `gap`: number, default `12`, 0..500, px, only when `packLarge` is `2x2`
   - `fill`: number, default `1`, 0..1
   - `fillDirection` (**Fill direction**): number, default `0`, 0..1
   - `fillAngle` (**Fill angle**): angle, default `90`
   - `fillSeed` (**Fill seed**): seed, default `1`
   - `radius`: number, default `1`, 0..5, fraction
   - `rings`: number, default `1`, 1..64
   - `ringSpacing` (**Ring spacing**): number, default `1.1`, 0..5, fraction
   - `align`: boolean, default `true`
   - `startAngle` (**Start**): angle, default `0`
   - `offset`: point, default `[1.1,0]`, fraction
   - `scaleStep` (**Scale step**): number, default `1`, 0..2
   - `rotateStep` (**Rotate step**): angle, default `0`
   - `even` (**Even gaps**): boolean, default `false`, not animatable
   - `target` (**Object**): node, default `""`
   - `place`: "contour" | "vertices" | "inside", default `"contour"`, not animatable
   - `seed`: seed, default `1`
   - `jitter` (**Position jitter**): point, default `[0,0]`, fraction
   - `scaleMin` (**Scale min**): number, default `1`, 0.05..4
   - `scaleMax` (**Scale max**): number, default `1`, 0.05..4
   - `rotateJitter` (**Rotation jitter**): angle, default `0`
   - `variationSeed` (**Variation seed**): seed, default `1`
13. **`particles`** (Particles, menu Repeat): Seeded particle generator that uses the complete source object as its particle: geometry, colours and relative proportions are preserved. Burst or continuous stream, lifetime and fade, emitter area, direction, spread, velocity and spin. Free motion supports gravity, drag, constant wind drift, smooth seeded turbulence and spiral motion. Lifetimes can vary; particles can fade in, fade out and change size over their life, and Stretch by speed lengthens each one along its direction of travel (motion streaks for sparks, rain or fireworks). Explicit birth rate, prewarm and reference size separate emission and motion scale from the source artwork. Burst impulse mode passes velocity and spin to a following Gravity or to the Physics of an enclosing group. Time follows scene.time unless it is set (a number, keys or a formula). Up to 512 live particles, reduced for very complex sources.
   - `time` (**Time (s)**): number, default `scene.time` (ƒx; `1` as fallback), 0..∞
   - `emission`: "burst" | "stream", default `"burst"`, not animatable
   - `count`: number, default `64`, 1..512
   - `lifetime` (**Lifetime (s)**): number, default `3`, 0.05..30
   - `lifetimeRandom` (**Life variation**): number, default `0`, 0..1
   - `rate` (**Birth rate (0 = auto)**): number, default `0`, 0..2000, /s, only when `emission` is `stream`
   - `prewarm`: boolean, default `false`, not animatable, only when `emission` is `stream`
   - `seed`: seed, default `1`
   - `center` (**Position**): point, default `[0.5,0.5]`, fraction
   - `emitter` (**Shape**): "point" | "line" | "box" | "circle", default `"circle"`, not animatable
   - `area`: point, default `[0.15,0.15]`, fraction, only when `emitter` is `line` or `box` or `circle`
   - `referenceSize` (**Reference size (0 = source)**): number, default `0`, 0..∞, px
   - `motion`: "free" | "impulse", default `"free"`, not animatable, only when `emission` is `burst`
   - `direction`: angle, default `-90`
   - `spread` (**Spread (°)**): number, default `90`, 0..360
   - `speed`: number, default `0.8`, 0..5, fraction
   - `speedRandom` (**Speed variation**): number, default `0.5`, 0..1
   - `spin`: angle, default `180`
   - `gravity`: number, default `0.6`, 0..5, fraction
   - `wind`: point, default `[0,0]`, fraction
   - `drag`: number, default `0`, 0..20
   - `turbulence`: number, default `0`, 0..2
   - `turbulenceFrequency` (**Turbulence frequency**): number, default `0.5`, 0.05..5, Hz
   - `swirl` (**Swirl (°/s)**): angle, default `0`
   - `alignToMotion` (**Align to motion**): boolean, default `false`, not animatable
   - `stretch` (**Stretch by speed**): number, default `0`, 0..5
   - `size`: number, default `0.05`, 0.001..1, fraction
   - `sizeRandom` (**Size variation**): number, default `0.6`, 0..1
   - `rotationRandom` (**Rotation variation**): angle, default `360`
   - `fade` (**Fade out**): number, default `0.2`, 0..1
   - `fadeIn` (**Fade in**): number, default `0`, 0..1
   - `sizeEnd` (**End size ×**): number, default `1`, 0..5
   - `keepSource` (**Keep source**): boolean, default `false`, not animatable
14. **`mirror`** (Mirror, menu Repeat): Reflects the drawing on an axis at a fraction of its box. `keep` keeps the original and adds the reflection (symmetry); `transform` replaces it with its reflection. Reference optionally measures another node (even hidden), allowing a fixed axis for generated collections.
   - `reference`: node, default `""`, not animatable
   - `axis`: "horizontal" | "vertical", default `"horizontal"`, not animatable
   - `position` (**Axis at**): number, default `1`, -1..2, fraction
   - `original`: "keep" | "transform", default `"keep"`, not animatable
15. **`mosaic`** (Mosaic, menu Deform): Cuts the drawing into tiles on a grid of columns × rows, with a gutter and a rotated grid: rectangles, triangles, hexagons, or one shape per cell (circle, polygon, star or another object). `cut` clips the drawing with each tile; `whole` places whole tiles where the drawing covers at least half.
   - `columns`: number, default `8`, 1..60
   - `rows`: number, default `8`, 1..60
   - `tile`: "rect" | "triangle" | "hexagon" | "circle" | "polygon" | "star" | "shape", default `"rect"`, not animatable
   - `sides`: number, default `5`, 3..12, only when `tile` is `polygon` or `star`
   - `source` (**Shape**): node, default `""`, only when `tile` is `shape`
   - `fit`: "cut" | "whole", default `"cut"`, not animatable
   - `gutter`: point, default `[4,4]`, px
   - `angle`: angle, default `0`
16. **`voronoi`** (Voronoi, menu Deform): Turns filled artwork into jittered Voronoi cells, clipped to its silhouette. Cell size controls density; Jitter and Seed shape the tessellation. Gap (2 px by default) leaves an even space between neighbouring cells, so they read even on a flat fill; set it to 0 for a closed tessellation. Cells sample and preserve source colour; use Color or Tint after Voronoi to style them. Optional Drift moves the sites smoothly and recomputes all cells together, keeping their shared borders aligned. Cells remain separate elements for effects such as Step, Color and Physics. Large grids coarsen automatically above about 1,000 sites.
   - `spacing` (**Cell size**): number, default `32`, 8..200, px
   - `jitter`: number, default `0.8`, 0..1
   - `gap`: number, default `2`, 0..60, px
   - `seed`: seed, default `1`
   - `drift`: number, default `0`, 0..0.5, fraction
   - `speed`: number, default `0.5`, 0..3
   - `time`: number, default `scene.time` (ƒx; `0` as fallback), 0..∞, s
17. **`fractal`** (Fractal, menu Repeat): Repeats the drawing inside itself, smaller each time (an iterated function system): Sierpinski triangle, Sierpinski carpet, a branching tree or a spiral. Capped at 4,096 copies.
   - `preset`: "sierpinski" | "carpet" | "tree" | "spiral", default `"sierpinski"`, not animatable
   - `depth`: number, default `4`, 1..12
   - `ratio` (**Scale**): number, default `0.7`, 0.2..0.95
   - `angle`: angle, default `25`
   - `fit`: boolean, default `true`, not animatable
18. **`halftone`** (Halftone, menu Draw): A halftone screen: the drawing sampled on a rotated grid where each cell becomes a mark (circle, square, diamond, line or ring) sized by the tone. Spacing, angle, min/max size, gamma, invert and jitter control the geometry. Marks retain sampled source colour; use Color or Tint after Halftone to style them.
   - `spacing`: number, default `10`, 1..200, px
   - `angle`: angle, default `45`
   - `min`: number, default `0`, 0..1.5
   - `max`: number, default `0.9`, 0..1.5
   - `gamma`: number, default `1`, 0.1..4
   - `shape`: "circle" | "square" | "diamond" | "line" | "ring", default `"circle"`, not animatable
   - `invert`: boolean, default `false`
   - `jitter`: number, default `0`, 0..1
   - `seed`: seed, default `1`
   - `offset`: point, default `[0,0]`, fraction
   - `merge` (**Merge marks**): boolean, default `false`, not animatable
19. **`vectorgrain`** (Vector Grain, menu Draw): Vector stipple that gathers at the edges, as real marks (not the SVG Grain filter). Density is highest at the edge and falls off over Falloff px, shaped by Curve, down to Interior deep inside. Edge: inside the shape, outside (a halo) or both. Marks are circles, squares or irregular specks; Size, Size jitter and Edge size control them. Their base colour comes from the source fill; use Color or Tint after Vector Grain to style the output. Opacity and Opacity jitter vary mark opacity, Distribution is random or even, and Source keeps or replaces the drawing. Seeded.
   - `edge`: "inside" | "outside" | "both", default `"inside"`, not animatable
   - `density`: number, default `2000`, 0..5000
   - `falloff`: number, default `40`, 0.5..2000, px
   - `curve`: number, default `1.5`, 0.1..6
   - `interior`: number, default `0`, 0..1
   - `center`: point, default `[0.5,0.5]`, fraction
   - `focus`: number, default `1`, 0..1
   - `focusCurve` (**Focus curve**): number, default `1`, 0.1..6
   - `distribution`: "random" | "even", default `"random"`, not animatable
   - `shape` (**Mark**): "circle" | "square" | "speck", default `"circle"`, not animatable
   - `size`: number, default `1.2`, 0.05..50, px
   - `sizeJitter` (**Size jitter**): number, default `0.5`, 0..1
   - `edgeSize` (**Edge size**): number, default `1`, 0.1..4
   - `blend`: "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "color-dodge" | "color-burn" | "hard-light" | "soft-light" | "difference" | "exclusion" | "hue" | "saturation" | "color" | "luminosity", default `"normal"`, not animatable
   - `opacity`: number, default `1`, 0..1
   - `opacityJitter` (**Opacity jitter**): number, default `0`, 0..1
   - `source`: "keep" | "replace", default `"keep"`, not animatable
   - `seed`: seed, default `1`
20. **`crosshatch`** (Crosshatch, menu Draw): Pen-drawing shading with parallel lines: up to four layers of hatching (at Angle, then +90°, +45° and −45°), each drawn only where the tone is darker than its threshold, so dark areas get denser cross-hatching. Spacing, line width, gamma, invert and offset control the look; Fix lines anchors the screen to the scene as the object moves, rotates or scales; off, the lines follow the object. Lines retain sampled source colour; use Color or Tint after Crosshatch to style them. Merge joins lines into one path per sampled source style and keeps the whole drawing as one physics body (Gravity or Physics), on both Solids and the Floor; off, each line is a separate body. Canvas handles adjust Offset, Angle and Spacing. Add Roughen after it for a hand-drawn line.
   - `spacing`: number, default `6`, 1..100, px
   - `angle`: angle, default `45`
   - `layers`: number, default `3`, 1..4
   - `width` (**Line width**): number, default `1`, 0.1..20, px
   - `gamma`: number, default `1`, 0.1..4
   - `invert`: boolean, default `false`
   - `offset`: point, default `[0,0]`, fraction
   - `fixLines` (**Fix lines**): boolean, default `false`, not animatable
   - `merge` (**Merge lines**): boolean, default `false`, not animatable
21. **`dithering`** (Dithering, menu Draw): Converts sampled tone into a binary grid of vector cells. Bayer uses an ordered 2×2 to 16×16 threshold matrix; Floyd–Steinberg and Atkinson diffuse quantization error for smoother tonal patterns; Noise uses a repeatable seeded random threshold. Cell size, angle, threshold, gamma and invert control the pattern. Cells retain sampled source colour; use Color or Tint after Dithering to style them. Merge combines contiguous cells into larger rectangles and same-colour paths. Large grids increase cell size automatically to keep sampling bounded.
   - `spacing` (**Cell size**): number, default `6`, 1..100, px
   - `angle`: angle, default `0`
   - `algorithm`: "bayer" | "floyd-steinberg" | "atkinson" | "noise", default `"bayer"`, not animatable
   - `matrix` (**Bayer matrix**): "2" | "4" | "8" | "16", default `"4"`, not animatable, only when `algorithm` is `bayer`
   - `threshold`: number, default `0.5`, 0..1
   - `gamma`: number, default `1`, 0.1..4
   - `invert`: boolean, default `false`
   - `seed`: seed, default `1`
   - `offset`: point, default `[0,0]`, fraction
   - `merge` (**Merge cells**): boolean, default `true`, not animatable
22. **`contour`** (Contour, menu Draw): Draws vector isolines through equal tones in the input, like elevation lines on a map. Sample spacing controls detail; Levels sets how many tone bands are outlined. Gamma and Invert reshape the tonal map; line width and Merge control the paths. Lines retain sampled source colour; use Color or Tint after Contour to style them. Large grids adapt their spacing to bound work.
   - `spacing` (**Sample spacing**): number, default `6`, 1..100, px
   - `levels`: number, default `6`, 1..16
   - `width` (**Line width**): number, default `1`, 0.1..20, px
   - `gamma`: number, default `1`, 0.1..4
   - `invert`: boolean, default `false`
   - `merge` (**Merge contours**): boolean, default `true`, not animatable
23. **`slices`** (Slices, menu Glitch): Glitch: horizontal bands of the drawing shifted sideways, each one an element.
   - `count`: number, default `14`, 1..60
   - `chance` (**Shifted**): number, default `0.45`, 0..1
   - `shift`: number, default `0.05`, 0..0.4, fraction
   - `seed`: seed, default `1`
24. **`blocks`** (Blocks, menu Glitch): Glitch: rectangular blocks cut out and shown displaced, leaving their gap.
   - `count`: number, default `8`, 1..80
   - `size`: number, default `0.07`, 0.01..0.4, fraction
   - `shift`: number, default `0.05`, 0..0.4, fraction
   - `seed`: seed, default `1`
25. **`scanlines`** (Scanlines, menu Glitch): Glitch: scan lines across the drawing, clipped to it.
   - `count`: number, default `60`, 1..300
   - `width`: number, default `0.75`, 0.1..6, px
26. **`streaks`** (Streaks, menu Glitch): Glitch: streaks escaping sideways from the real edge of the shape. With Bite, the band looks shifted: what sticks out on one side is missing on the other.
   - `count`: number, default `6`, 1..40
   - `length`: number, default `0.15`, 0.01..1, fraction
   - `width`: number, default `1.5`, 0.25..10, px
   - `bite`: number, default `1`, 0..2
   - `seed`: seed, default `1`
27. **`rgbsplit`** (RGB Split, menu Glitch): Chromatic separation with two modes: Channels (default) extracts the source RGB plates, shifting red and blue along Angle while green stays in place. Dark backgrounds use Screen; Light uses complementary CMY plates with Multiply. Solid colours, gradients and paint alpha are preserved. Duo keeps the original two-colour copies with Color A/B, Layer, Blend and Original. Nested effects apply only to the shifted plates, including independent filters; in Duo they apply to the two copies. Takes nested effects (`children`): they apply only to the coloured copies. Anything but another RGB Split.
   - `mode`: "channels" | "duo", default `"channels"`, not animatable
   - `distance`: number, default `3`, 0..60, px
   - `angle`: angle, default `0`
   - `background`: "dark" | "light", default `"dark"`, not animatable, only when `mode` is `channels`
   - `colorA` (**Color A**): color, default `"#00e5ff"`, only when `mode` is `duo`
   - `colorB` (**Color B**): color, default `"#ff2bd6"`, only when `mode` is `duo`
   - `layer`: "behind" | "front", default `"behind"`, not animatable, only when `mode` is `duo`
   - `blend`: "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "color-dodge" | "color-burn" | "hard-light" | "soft-light" | "difference" | "exclusion" | "hue" | "saturation" | "color" | "luminosity", default `"normal"`, not animatable, only when `mode` is `duo`
   - `original`: boolean, default `true`, only when `mode` is `duo`
28. **`boolean`** (Boolean, menu Deform): Boolean operations between elements (a group's children, a Clone's copies…): union, subtract (the front ones cut the back one), intersect or exclude. Curves are approximated with straight segments.
   - `mode`: "union" | "subtract" | "intersect" | "exclude", default `"union"`, not animatable
29. **`metaball`** (Metaball, menu Deform): The elements melt together through a smooth union of their two nearest distance fields, keeping multiway junctions stable. Reach controls the blend width; negative Grow contracts the result and can separate narrow joins. Quality adds contour detail and is automatically capped to keep field sampling responsive.
   - `reach`: number, default `30`, 0..400, px
   - `grow`: number, default `0`, -100..100, px
   - `quality`: number, default `100`, 30..400, not animatable
30. **`pixelate`** (Pixelate, menu Draw): Everything made of little squares, like pixel art: a grid of `size` px where each cell takes the colour of what is on top at its centre (stroke or fill). Runs of the same colour are merged; `gap` and `dot` give an LED-screen look. Vector, sharp at any size.
   - `size`: number, default `8`, 0..200, px
   - `gap`: number, default `0`, 0..50, px
   - `shape`: "square" | "dot", default `"square"`, not animatable
   - `offset`: point, default `[0,0]`, fraction

### 7.3 Effectors (`kind: "effector"`): act per element, usually through nested effects

1. **`step`** (Step, menu Effect): Incremental effector: applies the modifiers nested in it to each element separately, with their numbers multiplied by the element's position. A 10° Twist under Step turns the first copy 10°, the second 20°… Takes nested effects (`children`): applies them to each element with their numbers multiplied by the element position. Nested effectors (Step, Stagger, Range, Field) are not allowed.
   - `strength`: number, default `1`, 0..2
   - `reverse`: boolean, default `false`, not animatable
2. **`each`** (Each, menu Effect): Applies the effects nested in it to every element separately (Clone copies, letters, tiles…), with formulas that read the element: element.index, element.count, element.row and element.column (grid), element.u and element.v (0–1 across the grid), element.distance (0 at the centre of the elements, 1 for the furthest) and element.random (a fixed 0–1 number per element; Random seed varies it). For example, Each › Transform with scale = 1 - element.distance. A Shape inside it rebuilds each copy with other values for the shape's own parameters. Takes nested effects (`children`): applies them to each element separately, evaluating their formulas with `element.*` for that element. A `shapevalues` (Shape) child rebuilds each copy of a shape object with other values for its own parameters. Nested effectors are not allowed.
   - `seed` (**Random seed**): seed, default `1`
3. **`oscillate`** (Oscillate, menu Effect): Periodic modulation of nested effects: sine, triangle, square or saw. Frequency is cycles per second; amplitude and offset control signal strength. Phase and Element phase are degrees. Disable Per element to move the whole object together. Time follows scene.time unless it is set; numeric child parameters move around their neutral values (scale around 1).
   - `wave`: "sine" | "triangle" | "square" | "saw", default `"sine"`, not animatable
   - `time`: number, default `scene.time` (ƒx; `0` as fallback), s
   - `frequency`: number, default `1`, 0..20, Hz
   - `amplitude`: number, default `1`, 0..2
   - `offset`: number, default `0`, -2..2
   - `phase`: angle, default `0`
   - `perElement` (**Per element**): boolean, default `true`, not animatable
   - `elementPhase` (**Element phase**): angle, default `20`, only when `perElement` is `true`
4. **`wiggle`** (Wiggle, menu Effect): Smooth seeded random modulation of nested effects. Frequency controls the rate of change, amplitude its strength, offset its centre. Per element gives each clone or glyph an independent reproducible signal. Time follows scene.time unless it is set; seeking backwards gives the same result.
   - `time`: number, default `scene.time` (ƒx; `0` as fallback), s
   - `frequency`: number, default `1`, 0..20, Hz
   - `amplitude`: number, default `1`, 0..2
   - `offset`: number, default `0`, -2..2
   - `phase`: angle, default `0`
   - `perElement` (**Per element**): boolean, default `true`, not animatable
   - `elementPhase` (**Element phase**): angle, default `20`, only when `perElement` is `true`
   - `seed`: seed, default `1`
5. **`pulse`** (Pulse, menu Effect): Repeated pulses of nested effects, from neutral to full strength and back. Attack and Decay are fractions of one cycle; any remaining time is rest. If their sum exceeds 1 they are fitted to one cycle. Frequency, amplitude, offset and per-element phase work as in Oscillate. Time follows scene.time unless it is set.
   - `time`: number, default `scene.time` (ƒx; `0` as fallback), s
   - `frequency`: number, default `1`, 0..20, Hz
   - `amplitude`: number, default `1`, 0..2
   - `offset`: number, default `0`, -2..2
   - `phase`: angle, default `0`
   - `perElement` (**Per element**): boolean, default `true`, not animatable
   - `elementPhase` (**Element phase**): angle, default `20`, only when `perElement` is `true`
   - `attack` (**Attack / cycle**): number, default `0.1`, 0..1, fraction
   - `decay` (**Decay / cycle**): number, default `0.4`, 0..1, fraction
6. **`shake`** (Shake, menu Effect): A seeded one-shot impact that loses strength and returns exactly to neutral at Duration. Start schedules the hit; Frequency sets its vibration rate and Decay how quickly it settles. Per element adds independent signals and an Element delay. The default Transform child shakes position and rotation; seeking is deterministic.
   - `time`: number, default `scene.time` (ƒx; `0` as fallback), s
   - `start`: number, default `0`, s
   - `duration`: number, default `1`, 0.01..10, s
   - `frequency`: number, default `8`, 0..20, Hz
   - `amplitude`: number, default `1`, 0..2
   - `decay`: number, default `2`, 0.1..8
   - `perElement` (**Per element**): boolean, default `false`, not animatable
   - `elementDelay` (**Element delay**): number, default `0.04`, 0..1, s, only when `perElement` is `true`
   - `seed`: seed, default `1`
7. **`stagger`** (Stagger, menu Effect): Each element makes its own transition, with its curve, a little after the previous one. Progress (0–1) is the whole animation: animate it with two keys. `in` brings elements in, `out` takes them away. Takes nested effects (`children`): each element goes from them to its rest (in) or the other way (out), one after another. Nested effectors are not allowed.
   - `progress`: number, default `1`, 0..1
   - `direction`: "in" | "out", default `"in"`, not animatable
   - `stagger`: number, default `0.5`, 0..1
   - `ease`: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "expo-in" | "expo-out" | "back-in" | "back-out" | "elastic-in" | "elastic-out" | "bounce-in" | "bounce-out", default `"ease-out"`, not animatable
   - `jitter`: number, default `0`, 0..64
   - `order`: "forward" | "reverse" | "center" | "edges" | "random", default `"forward"`, not animatable
   - `unit`: "elements" | "words" | "lines", default `"elements"`, not animatable
   - `seed`: seed, default `1`
8. **`range`** (Range, menu Effect): Selects elements, text words/lines or Clone grid rows/columns for nested effects. Select: All, Even, Odd or CSS-style An+B (one-based). Start/End/Offset limit the selection; Falloff (stored as shape) controls strength, with Square applying a uniform amount. Odd grid rows are 1, 3, 5… and keep their original indices through partial grids. In Wire, only the Range selected in the stack highlights its affected elements, using a stable five-colour palette. Takes nested effects (`children`), weighted per element by its order. Nested effectors are not allowed.
   - `selector` (**Select**): "all" | "even" | "odd" | "nth", default `"all"`, not animatable
   - `nth` (**An+B**): text, default `"2n"`, not animatable, only when `selector` is `nth`
   - `start`: number, default `0`, 0..1
   - `end`: number, default `1`, 0..1
   - `offset`: number, default `0`, -1..1
   - `shape` (**Falloff**): "square" | "ramp up" | "ramp down" | "triangle" | "round" | "smooth", default `"square"`, not animatable
   - `unit`: "elements" | "words" | "lines" | "rows" | "columns", default `"elements"`, not animatable
   - `amount`: number, default `1`, 0..1
   - `random` (**Random order**): boolean, default `false`, not animatable
   - `seed`: seed, default `1`
9. **`field`** (Field, menu Effect): Field selector: the nested effects act more or less on each element depending on where it is relative to a shape (ellipse, plane or box). Circle and Box take Width and Height; Linear fades over Distance. Contain decides when an element counts as inside: its centre, all of it (full) or any part of it (partial). Move the field to sweep the drawing; Softness is how much of the edge is a transition. In an Effector node the field is one place in the scene (fractions of the document) for all its targets. Takes nested effects (`children`), weighted per element by its position. Nested effectors are not allowed.
   - `shape`: "circle" | "linear" | "box", default `"circle"`, not animatable
   - `center`: point, default `[0.5,0.5]`, fraction
   - `width`: number, default `0.7`, 0.01..4, fraction, only when `shape` is `circle` or `box`
   - `height`: number, default `0.7`, 0.01..4, fraction, only when `shape` is `circle` or `box`
   - `distance`: number, default `0.35`, 0.01..2, fraction, only when `shape` is `linear`
   - `contain`: "center" | "full" | "partial", default `"center"`, not animatable
   - `softness`: number, default `0.5`, 0..1
   - `angle`: angle, default `0`
   - `invert`: boolean, default `false`, not animatable
   - `amount`: number, default `1`, 0..1
   - `unit`: "elements" | "words" | "lines", default `"elements"`, not animatable
10. **`explosion`** (Explosion, menu Motion): Each element (a piece of Damage or Crack, a Mosaic tile, a Clone copy, a letter…) flies away from a centre: it moves out, spins and shrinks a little, each in its own way. `amount` from 0 to 1 plays the explosion. Motion: impulse launches the pieces through a following Gravity or an enclosing Physics group, preserving velocity and spin; offset keeps the direct displacement mode.
   - `motion`: "offset" | "impulse", default `"offset"`, not animatable
   - `amount`: number, default `0.5`, 0..1
   - `force`: number, default `0.5`, 0..3, fraction
   - `spin`: angle, default `90`
   - `shrink`: number, default `0.3`, 0..1
   - `chaos`: number, default `0.5`, 0..1
   - `center`: point, default `[0.5,0.5]`, fraction
   - `seed`: seed, default `1`
11. **`gravity`** (Gravity, menu Motion): Drops each element onto a virtual floor, rigid by default or elastic when it carries Soft Body material, inheriting velocity and spin from Explosion or Rigid Body. Enable Collisions for piece-to-piece contacts; select Solids to collide with other objects as fixed obstacles. If the input exceeds 512 paths, Gravity combines it into one simplified body and disables body and Solid collisions, reporting a diagnostic so playback stays responsive. Friction and Bounce apply to all contacts. Only the exterior of each shape collides (letter counters and holes are solid), while gaps between disconnected filled shapes stay open. For hollow obstacles that contain bodies, use Physics. Targets use their current-frame geometry throughout the replay, not their past movement. Floor rotation is measured from the scene horizon, independently of the object or parent rotation. Crosshatch lines collide with Solids and the Floor consistently: Merge on keeps one body across colours; off, each stroke is independent. Initially crossed line pairs start colliding only after separating, so playback does not eject the screen at startup. Other ordinary open paths retain floor-only dynamics. Cached deterministic simulation, up to 3600 seconds. Inside a group with Physics it does not simulate on its own: it adds its pull and floor to that Physics, for the bodies it is on.
   - `time` (**Time (s)**): number, default `scene.time` (ƒx; `1` as fallback), 0..3600
   - `gravity`: number, default `1`, 0..10, fraction
   - `floor` (**Floor position**): point, default `[0.5,1.5]`, fraction
   - `rotation` (**Floor rotation**): angle, default `0`
   - `collisions` (**Body collisions**): boolean, default `false`, not animatable
   - `solids`: nodes, default `[]`, not animatable
   - `physics` (**Rigid bodies**): boolean, default `true`, not animatable
   - `friction`: number, default `0.7`, 0..1
   - `bounce`: number, default `0.15`, 0..1
12. **`physics`** (Physics, menu Motion): A 2D dynamics simulation for the children of a group: each element is a rigid body, or elastic when it carries Soft Body. Collisions between bodies are optional; Solids are fixed obstacles from other objects (holes are kept, so a hollow shape can contain bodies). Acceleration is a constant force for all; Air drag slows moving bodies down; Friction and Bounce apply to every contact. Each child's start (velocity, spin, immovable, attraction) comes from Rigid Body, and a Gravity on a child adds its own pull and floor. A live world: it steps forward from the previous frame, so a body that appears (a Mouse Instance click in the group, a child that starts to exist, an Explosion's pieces) joins the running simulation at that moment, and seeking back restores a snapshot; editing the scene restarts it. In Play, the pointer can act on the body under it: Click push pushes it away from the click, Double-click burst breaks it into pieces that fly out from its centre, and Drag & throw grabs it with a spring and throws it on release. Network links follow the bodies they join. Up to 3600 seconds.
   - `time` (**Time (s)**): number, default `scene.time` (ƒx; `0` as fallback), 0..3600
   - `acceleration`: point, default `[0,0]`, px
   - `damping` (**Air drag**): number, default `0`, 0..20, 1/s
   - `collisions` (**Body collisions**): boolean, default `true`
   - `solids`: nodes, default `[]`, not animatable
   - `friction`: number, default `0`, 0..1
   - `bounce`: number, default `1`, 0..1
   - `poke` (**Click push**): number, default `0`, 0..5000, px/s
   - `burst` (**Double-click burst**): number, default `0`, 0..16, not animatable
   - `drag` (**Drag & throw**): boolean, default `false`, not animatable
   - `burstSpeed` (**Burst speed**): number, default `250`, 0..3000, px/s
13. **`rigidpieces`** (Rigid Pieces, menu Effect): Marks each current element as a rigid piece. Amount blends normal pointwise deformation with whole-piece motion: 0 bends normally, 1 preserves the piece shape. Nested Transform and Transform 3D wait until a downstream deformer actually moves the piece. Transform 3D also moves each piece along camera Z, projecting that depth into scale. Nest Color, Tint, Opacity, Paint, Gradient or Feather to style pieces individually; Pivot sets the shared rotation anchor. Takes nested deformers and per-piece style effects (`color`, `tint`, `opacity`, `paint`, `gradient`, `feather`). Transform and Rotate 3D are deferred until a downstream deformer moves the piece. Nested effectors are not allowed.
   - `amount`: number, default `1`, 0..1
   - `pivot`: "center" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw", default `"center"`, not animatable

### 7.4 Style (`kind: "style"`): colour and paint, not geometry

1. **`color`** (Color, menu Style): Assign or vary colour per element: `solid` assigns the selected colour to fill, stroke or both; `shift` rotates the hue and adjusts saturation and lightness; `gradient` spreads a gradient across the elements; `random` varies them at random; `palette` picks one exact colour from an editable list for each element, including each Clone copy. Copies emitted by one Mouse Instance input event share a palette choice.
   - `mode`: "solid" | "shift" | "gradient" | "random" | "palette", default `"shift"`, not animatable
   - `palette` (**Colors**): palette, default `["#ff6b5e","#ffc857","#09fdd1","#4d8dff","#b894f6"]`, not animatable, only when `mode` is `palette`
   - `paletteMode` (**Choose**): "random" | "index", default `"random"`, not animatable, only when `mode` is `palette`
   - `index`: number, default `0`, only when `mode` is `palette` and `paletteMode` is `index`
   - `color`: color, default `"#D2502F"`, only when `mode` is `solid`
   - `hue`: angle, default `30`, only when `mode` is `shift`
   - `saturation`: number, default `0`, -1..1, only when `mode` is `shift`
   - `lightness`: number, default `0`, -1..1, only when `mode` is `shift`
   - `from`: color, default `"#09fdd1"`
   - `to`: color, default `"#ff6b5e"`
   - `variation`: number, default `0.3`, 0..1
   - `seed`: seed, default `1`
   - `target`: "fill" | "stroke" | "both", default `"fill"`, not animatable
2. **`tint`** (Tint, menu Style): Pushes the colour towards a target colour. Inside Step the amount grows copy by copy (white lightens, black darkens).
   - `color`: color, default `"#ffffff"`
   - `amount`: number, default `0.3`, 0..1
   - `target`: "fill" | "stroke" | "both", default `"fill"`, not animatable
3. **`paint`** (Paint, menu Style): Fill and stroke: lays a colour over the fill (amount 1 replaces it) and adds or changes the stroke: width, opacity, joins, caps, dashes and paint order.
   - `fill`: boolean, default `true`, not animatable
   - `fillColor` (**Color**): color, default `"#09fdd1"`
   - `fillAmount` (**Amount**): number, default `1`, 0..1
   - `fillOpacity` (**Opacity**): number, default `1`, 0..1
   - `fillEmpty` (**Fill empty**): boolean, default `false`, not animatable
   - `stroke`: boolean, default `false`, not animatable
   - `strokeColor` (**Color**): color, default `"#000000"`
   - `strokeWidth` (**Width**): number, default `1`, 0..200, px
   - `strokeOpacity` (**Opacity**): number, default `1`, 0..1
   - `strokeJoin` (**Join**): "keep" | "miter" | "round" | "bevel", default `"keep"`, not animatable
   - `strokeCap` (**Cap**): "keep" | "butt" | "round" | "square", default `"keep"`, not animatable
   - `dash`: number, default `0`, 0..400, px, only when `stroke` is `true`
   - `gap`: number, default `0`, 0..400, px, only when `stroke` is `true`
   - `dashOffset` (**Dash offset**): number, default `0`, -10000..10000, px, only when `stroke` is `true`
   - `behind` (**Behind fill**): boolean, default `false`, not animatable, only when `stroke` is `true`
4. **`gradient`** (Gradient, menu Style): A gradient on the fill or the stroke of each shape: linear (with an angle) or radial (centre, radius and focus), with an optional middle colour (`via`). Relative to each shape's box, so it follows the shape.
   - `kind`: "linear" | "radial", default `"linear"`, not animatable
   - `from`: color, default `"#09fdd1"`
   - `to`: color, default `"#5c3cff"`
   - `fromOpacity` (**From opacity**): number, default `1`, 0..1
   - `toOpacity` (**To opacity**): number, default `1`, 0..1
   - `via`: boolean, default `false`, not animatable
   - `viaColor` (**Via color**): color, default `"#ffffff"`
   - `midpoint`: number, default `0.5`, 0.05..0.95
   - `angle`: angle, default `90`
   - `center`: point, default `[0.5,0.5]`, fraction
   - `radius`: number, default `0.5`, 0.05..2, fraction
   - `focus`: point, default `[0.5,0.5]`, fraction
   - `focalRadius` (**Focal radius**): number, default `0`, 0..2, fraction
   - `spread`: "pad" | "reflect" | "repeat", default `"pad"`, not animatable
   - `transform`: text, default `""`
   - `apply` (**Apply to**): "fill" | "stroke", default `"fill"`, not animatable
5. **`imagefill`** (Image Fill, menu Style): Fills each shape from a raster image object in the scene. Hide source is on by default: the image stays available as a fill but is not drawn or treated as a separate physics body. Turn it off to show the source object. Cover preserves proportions and crops, Contain preserves proportions and leaves the fill colour behind, and Stretch fills the whole shape. Uses the original stack bounds as one shared image frame; Crack shards, Clone copies and Voronoi cells preserve that image material through generation, and it moves with Gravity.
   - `source`: node, default `""`, not animatable
   - `hideSource` (**Hide source**): boolean, default `true`, not animatable
   - `fit`: "cover" | "contain" | "stretch", default `"cover"`, not animatable
   - `scale`: number, default `1`, 0.1..5
   - `position`: point, default `[0.5,0.5]`, fraction
6. **`feather`** (Feather, menu Style): Softens a solid fill with a radial fade and slightly expands the shape to preserve its opaque centre. Uses a native SVG gradient instead of a raster blur filter, so it is lighter for many small copies.
   - `softness`: number, default `0.2`, 0..0.6, fraction
7. **`mask`** (Mask, menu Style): Native SVG mask: the object only shows where another object lets it (`source`). `shape`: inside the mask's shape (`invert`: outside). `luminance`: the mask's colours decide (white shows, black hides; a gradient gives soft fades). Whole elements discards copies crossing the boundary instead of clipping them (shape mode). The mask can be hidden and still works.
   - `source` (**Mask**): node, default `""`
   - `mode`: "shape" | "luminance", default `"shape"`, not animatable
   - `whole` (**Whole elements**): boolean, default `false`, not animatable, only when `mode` is `shape`
   - `invert`: boolean, default `false`, not animatable, only when `mode` is `shape`
8. **`opacity`** (Opacity, menu Style): Makes the drawing transparent. With Range or Field, letters or pieces that appear or fade away.
   - `opacity`: number, default `0.5`, 0..1

### 7.5 SVG filters (`kind: "filter"`): applied by the browser after the whole stack

1. **`shadow`** (Shadow, menu Filters): Drop shadow: a blurred, shifted copy behind the drawing, in one colour.
   - `offset`: point, default `[6,8]`, px
   - `blur`: number, default `6`, 0..100, px
   - `color`: color, default `"#000000"`
   - `opacity`: number, default `0.5`, 0..1
2. **`blur`** (Blur, menu Filters): Blur in both directions or only one (motion blur), on the whole drawing or only in an area.
   - `amount`: number, default `4`, 0..100, px
   - `direction`: "both" | "horizontal" | "vertical", default `"both"`, not animatable
   - `area`: "all" | "radial" | "band", default `"all"`, not animatable
   - `center`: point, default `[0.5,0.5]`, fraction, only when `area` is `radial` or `band`
   - `radius`: number, default `0.3`, 0..2, fraction, only when `area` is `radial` or `band`
   - `falloff`: number, default `0.5`, 0..1, only when `area` is `radial` or `band`
   - `angle`: angle, default `0`, only when `area` is `band`
   - `invert`: boolean, default `false`, only when `area` is `radial` or `band`
3. **`glow`** (Glow, menu Filters): A coloured halo around the drawing, behind it.
   - `size`: number, default `10`, 0..100, px
   - `color`: color, default `"#09fdd1"`
   - `strength`: number, default `0.8`, 0..3
4. **`grain`** (Grain, menu Filters): Fine noise over the drawing (only inside it), like film or print grain.
   - `amount`: number, default `0.35`, 0..1
   - `size`: number, default `1`, 0.25..10, px
   - `seed`: seed, default `1`
   - `area`: "all" | "radial" | "band", default `"all"`, not animatable
   - `center`: point, default `[0.5,0.5]`, fraction, only when `area` is `radial` or `band`
   - `radius`: number, default `0.3`, 0..2, fraction, only when `area` is `radial` or `band`
   - `falloff`: number, default `0.5`, 0..1, only when `area` is `radial` or `band`
   - `angle`: angle, default `0`, only when `area` is `band`
   - `invert`: boolean, default `false`, only when `area` is `radial` or `band`
5. **`displace`** (Displace, menu Filters): The edges tremble or ripple with organic noise. Animate Amount or the seed.
   - `amount`: number, default `12`, 0..200, px
   - `scale`: number, default `40`, 2..500, px
   - `detail`: number, default `2`, 1..6
   - `seed`: seed, default `1`
   - `area`: "all" | "radial" | "band", default `"all"`, not animatable
   - `center`: point, default `[0.5,0.5]`, fraction, only when `area` is `radial` or `band`
   - `radius`: number, default `0.3`, 0..2, fraction, only when `area` is `radial` or `band`
   - `falloff`: number, default `0.5`, 0..1, only when `area` is `radial` or `band`
   - `angle`: angle, default `0`, only when `area` is `band`
   - `invert`: boolean, default `false`, only when `area` is `radial` or `band`
6. **`bevel`** (Bevel, menu Filters): Relief: light and shade on the edges, as if the drawing had volume. The light comes from `angle` at `elevation`; `depth` is the bevel width, `height` how much it stands out, `shine` the highlight.
   - `depth`: number, default `4`, 0.5..60, px
   - `height`: number, default `3`, 0..20
   - `angle` (**Light**): angle, default `-135`
   - `elevation`: number, default `45`, 5..85, °
   - `strength`: number, default `0.8`, 0..1
   - `shine`: number, default `0.5`, 0..2
   - `shininess`: number, default `20`, 1..128
7. **`thicken`** (Thicken, menu Filters): Makes the drawing thicker (or thinner with a negative amount), or adds a coloured outline around it like a sticker (`outline`). Works on whatever is painted: text, strokes, anything.
   - `mode`: "grow" | "outline", default `"grow"`, not animatable
   - `amount`: number, default `3`, -40..40, px
   - `color`: color, default `"#ffffff"`, only when `mode` is `outline`
8. **`tone`** (Tone, menu Filters): Tone: posterize (few levels per channel, like a poster), duotone (shadows in one colour and lights in another) or invert the colours. On the whole drawing or only in an area.
   - `mode`: "posterize" | "duotone" | "invert", default `"posterize"`, not animatable
   - `levels`: number, default `4`, 2..16, only when `mode` is `posterize`
   - `dark` (**Shadows**): color, default `"#1b1464"`, only when `mode` is `duotone`
   - `light` (**Lights**): color, default `"#ff4fa3"`, only when `mode` is `duotone`
   - `area`: "all" | "radial" | "band", default `"all"`, not animatable
   - `center`: point, default `[0.5,0.5]`, fraction, only when `area` is `radial` or `band`
   - `radius`: number, default `0.3`, 0..2, fraction, only when `area` is `radial` or `band`
   - `falloff`: number, default `0.5`, 0..1, only when `area` is `radial` or `band`
   - `angle`: angle, default `0`, only when `area` is `band`
   - `invert`: boolean, default `false`, only when `area` is `radial` or `band`

<!-- generated:catalog:end -->

## 8. Animation & Keyframe Tracks

Timeline tracks belong in `scene.animation.tracks`:

```json
{
  "id": "track-1",
  "node": "star-1",
  "on": "modifier",
  "modifier": "twist-1",
  "param": "angle",
  "keys": [
    { "t": 0, "value": 0, "ease": "ease-in-out" },
    { "t": 2, "value": 180, "ease": "ease-in-out" },
    { "t": 4, "value": 0 }
  ],
  "repeat": 0,
  "every": 4
}
```

In the editor, click a keyframe to select it without moving the playhead. Drag empty timeline space to marquee-select keys across tracks; Shift adds keys to the selection. Drag any selected key to move the selection as a block. Drag a selected key at the rightmost time to retime the selection proportionally around its leftmost time, preserving the intervals; a move that would collide with another key on the same track is rejected. Delete removes the selected keys together. Clicking empty track space still scrubs the playhead, and dragging the ruler scrubs continuously.

- `on: "node"`: Animates `"x"`, `"y"`, `"scale"`, `"rotation"`, `"opacity"`, `"pivot"`.
- `on: "shape"`: Animates primitive parameters (e.g. `radius`, `innerRadius`, `dashOffset`, `strokeWidth`).
- `on: "modifier"`: Animates any animatable modifier parameter (e.g. `angle`, `phase`, `distance`, or `enabled: true/false`).
- Supported Easings: `"linear"`, `"ease-in"`, `"ease-out"`, `"ease-in-out"`, `"expo-in"`, `"expo-out"`, `"back-in"`, `"back-out"`, `"elastic-in"`, `"elastic-out"`, `"bounce-in"`, `"bounce-out"`, `"hold"`.

---

## 9. Realtime Interactions

Interactions execute inside browser runtimes (`createPlayer` or editor Play mode):

```json
{
  "id": "int-1",
  "node": "star-1",
  "trigger": "pointer",
  "action": "follow",
  "target": { "node": "star-1", "on": "modifier", "modifier": "spherize-1", "param": "center" },
  "duration": 0.25
}
```

- `trigger`: `"hover"`, `"click"`, `"enter"` (scrolls into view), `"pointer"`.
- `action`: `"tween"` (lerp to target value and return), `"play"` (play timeline segment), `"seed"` (re-roll random seed), `"toggle"` (enable/disable modifier), `"follow"` (follows pointer coordinate with exponential inertia lag).

### Gravity (`gravity`)

Falls each element (glyph, clone, fragment or independent shape) onto an infinite virtual floor, without changing its geometry. Add it from **Effectors → Gravity**. With the effect selected, drag the floor line or its centre to move it; drag its end handle to rotate it (Shift snaps to 15°). The floor guide is editor-only and does not render.

- `time`: elapsed seconds, `0–3600`. Left out, it follows `scene.time` (playback); set a number or keys to drive it yourself.
- `gravity`: downward acceleration in source bounding-box sizes per second squared, default `1`.
- `floor`: floor position as fractions of an upright source reference box, default `[0.5, 1.5]`. The reference follows placement and scale while its axes stay aligned to the scene horizon.
- `rotation`: floor angle in clockwise degrees **from the scene horizon**, default `0` (horizontal). It does not inherit object or parent rotation. Gravity acts downwards in scene axes; the positive normal side of the floor is solid. The canvas guide and its position/rotation handles use the same reference as the simulation.

- `physics`: rigid-body dynamics, enabled by default. Disable for the original translation-only, frictionless mode.
- `friction`: contact friction, `0–1`, default `0.7`. Controls sliding and rolling at the floor.
- `bounce`: restitution, `0–1`, default `0.15`. Small resting impacts are damped to let bodies settle.

**Inside a Physics group.** A Gravity on a node whose ancestor group has Physics does not simulate on its own (two simulations of the same bodies used to fight each other). It becomes a force of that Physics: its pull (`gravity`, straight down the page) and its floor (`floor`, `rotation`) apply to the bodies it was on, rigid or Soft Body, on top of Physics' own Acceleration; other children are unaffected. Physics owns the clock, the contacts and the bodies, so Gravity's `time`, `collisions`, `solids`, `physics`, `friction` and `bounce` are ignored there (use Physics' own). This is how to give only some children of a world a floor or a pull.

All numeric parameters and floor position support animation. Rigid bodies use uniform-area centres of mass and rotational inertia: off-centre contacts generate rotation, so unstable pieces tip onto a supporting face. Shapes sharing a clone tag move as one body, preserving paint order. Curves are sampled for mass/contact dynamics; exact cubic support prevents penetration of the rendered floor. Open paths use approximate mass properties. Crosshatch outputs explicit line bodies: their stroke width contributes to floor support and Solid contacts. With **Merge lines** off each line can rotate and settle independently on either surface. With Merge on, all colour paths stay together as one body and use the convex envelope of the marks for Solid contacts. When Collisions is enabled, the initial crossings in an unmerged screen do not create separation impulses: each initially overlapping pair becomes collidable after it separates. This state is included in deterministic seek/replay checkpoints. Other ordinary open paths still use floor-only dynamics; their stroke thickness is not included.

Physics integrates fixed 120 Hz steps, with a fractional final step. Mass properties are cached per input geometry; quarter-second checkpoints and the last full step are reused, so advancing time does not replay the entire fall. Geometry or physics parameter changes invalidate those states. Seeking backwards and headless rendering are deterministic. The current gravity, floor, friction and bounce values are held constant during that replay: their earlier animated values are not integrated. Collisions between pieces are optional (`collisions: true`). The floor guide remains editor-only.

### Soft Body material (`softbody`)

**Effect → Soft Body**, beside Rigid Body, defines a material. It does not move or deform the drawing by itself and has no Time, Gravity, Floor, Solids, friction or restitution controls. A following **Gravity**, or **Physics on an ancestor group**, owns the clock, forces and contacts. Each effect has one responsibility.

- `mode`: `"auto"` (default) applies elasticity to both open fibres and closed bodies; `"fibers"` or `"bodies"` limits the material to that path type. Other path types keep rigid dynamics.
- `body`: `"outline"` (default) keeps the existing contour-based body behaviour; `"beam"` adds a flexible internal spine and linked cross-sections so a closed, elongated body bends as a whole, then recovers toward its rigid rest shape as impacts settle. Bounce and floor contacts still come from Gravity or Physics. Choose per Soft Body effect; open fibres are unchanged. Beam adds solver constraints and costs more to simulate.
- `stiffness`: 0–1, default `0.8`. The defaults aim at firm rubber: limited deformation on impact and quick recovery. Lower values soften the material.
- `bending`: 0–1, default `0.15`, resistance to bending, especially for fibres.
- `volume`: 0–1, default `0.9`; **Keep area** for closed contours, including holes.
- `damping`: 0–1, default `0.4`. Damps internal deformation relative to the body's translation and rigid spin. It is not air drag and does not slow the fall of the whole body.
- `recovery`: 0–100, default `10`. For **Body model → Beam**, controls the return toward the original rigid shape as internal motion dies down. `0` leaves the beam deformed; `100` restores the full rest shape when it has settled. It does not replace Gravity/Physics Bounce.
- `pins`: `"free"` (default), `"start"` or `"ends"`, for fibre attachment. Rigid Body's Immovable still pins a complete body; its velocity and spin provide initial motion.
- `segments`: 4–64, default `24`; **Resolution**, approximate material samples per contour. Physics uses a coarse material cage based on contour length, retains authored vertices, and adapts subdivision for dense inputs. Rest-pose cubics, paint and gradients remain intact.

For selected copies, use **Clone → Range (Transform + Soft Body) → Gravity**. Putting Range/Soft Body after Gravity assigns a material after the simulation has already run; it cannot affect that earlier motion. Validation warns about this order. In a Physics group, put Soft Body on the child; keep Time, Acceleration, Solids, Friction and Bounce on the group's Physics effect. Gravity's Physics toggle must remain enabled to simulate elastic material.

The internal deformable solver uses fixed 120 Hz steps and cached checkpoints, using the Gravity/Physics Time up to 3600 seconds. In a Physics group it runs in Physics' live world (see Physics), so a soft body born at runtime joins the running simulation instead of replaying it. Forces, material values and targets are held at their current values throughout replay, as with the rigid simulation. It handles the floor, filled static solids and optional body contacts; no self-collision is applied within one material body. Contacts are sampled, rather than exact analytic curve intersections. A particle inside another body leaves by the side its own body is on (the other's edge nearest its body's centre), so a body pushed deep into another or into a thin wall comes back out the way it went in, and one born inside another (a click on a pile) gets out by its side; only open fibres born crossed (a hatching screen) ignore each other until they separate. Keep input topology stable during a simulation: changing cuts or tessellation rebuilds the material cage and replays that input from rest. Use fewer samples for complex imported paths. Run `node scripts/bench-softbody.mjs` for a CPU-only benchmark of nine crosses, four with the material; the sample scene is `apps/editor/public/demos/softbody-material.svrtk`. Merge on Crosshatch keeps its marks in one elastic structure; off leaves separate fibres. Merely assigning Soft Body does not turn on a simulation or Wire's body diagnostics.

**Performance.** The material plan and its replay checkpoints are cached by the input's content (outlines and material), so sequential playback only advances the few solver steps since the previous frame: per-frame cost stays flat over time. As a reference, 26 soft circles piling up in a Physics group take about 16 ms per frame on average (6 circles: about 3 ms). Seeking to a far, uncached time still simulates up to it. The editor's **Soft Cells** demo is that scene: soft donuts (a pin-hole as the white mark) falling into a pile against hidden floor and wall solids.

### Physics (`physics`)

A general rigid-body simulation for the children of a group. Add **Physics** to the group, then add **Rigid Body** to any child whose initial velocity, spin, mass center, fixed state or attraction field you want to set. Children without a Rigid Body start at rest and can still be pushed by collisions. **Mass center** defaults to Auto, which uses the geometry's center. Choose Custom and drag the Position handle on the canvas while Rigid Body is selected in the stack to move the center; this changes the body's rotation and collision response without changing its outline. Make a child **Immovable** to use it as a fixed collider; other bodies collide with it but cannot move it. Enable **Attractor** to pull other rigid bodies toward the nearest point on that child's solid geometry. Hollow shapes preserve their holes, so an object in a donut opening is attracted toward the ring, not the hole's centre. The inverse-square field has a **Strength** and a **Range** relative to the largest body, fixed or moving; a range of 0 is unlimited. Attraction is reciprocal, with the reaction force scaled by mass; an Immovable attractor absorbs it and stays fixed. **Absorption** reduces bounce and damps linear and angular motion on impact with the attractor, preserving the approach speed and allowing a few rebounds before settling despite perfectly elastic global collisions. Its default 0.5 keeps half the global bounce on impact; at 1, impacts with the attractor are fully inelastic. **Settle** sets the residual speed below which the solver zeros a body's motion after impact; it defaults to 3% of the largest body's scale per second. Set it to 0 to disable the cutoff. Set Absorption to 0 for conservative motion. The whole group shares one simulation and time.

- `time`: simulation time in seconds, `0–3600`. Left out, it follows `scene.time`.
- `acceleration`: constant `[x, y]` acceleration in px/s²; `[0, 0]` gives free, frictionless motion between impacts.
- `damping`: **Air drag**, 1/s, default `0`. Every moving body (and every Soft Body particle) loses this fraction of its speed and spin per second, so a thrown body slides and stops: with `2`, a body at 200 px/s covers about 100 px. Use it for top-down scenes without gravity (a table, a fridge door).
- `collisions`: whether dynamic children collide with each other (on by default). Immovable children and `solids` collide regardless.
- `solids`: optional fixed scene objects that act as colliders, including filled paths with holes.
- `friction`: contact friction, `0–1`, default `0`.
- `bounce`: restitution, `0–1`, default `1` for elastic impacts.
- `poke`: **Click push**, px/s, default `0` (off). In Play, a click on a body of the group pushes it straight away from the click point with this speed (rigid or Soft Body, Mouse copies included), and that click does not also fire the scene's Mouse Instances: click empty space to generate, click a body to push it. Each click is recorded on scene time and replayed at the same simulation step, so seeking back and playing again gives the same; going back before a click forgets it. Headless renders have no clicks.
- `burst`: **Double-click burst**, pieces, default `0` (off; 2–16 on). In Play, a double-click on a body of the group breaks it, once, into about that many pieces (Crack in shatter mode from the body's centre, with straight cracks, simplified outlines and no tiny splinters). Each piece goes on from where the body was, with its angle, speed and spin (Soft Body pieces too, turned as the body is), and leaves the centre at `burstSpeed`. Like Poke, it is recorded on scene time (runtime `scene.bursts`): seeking back before it makes the body whole again. The clicks of a double-click are one gesture: if the first one pushed the body from under the pointer (Click push), the second click and the double-click still belong to that body (within half a second and 40 px), so it bursts and no Mouse Instance fires. On a touch screen two quick taps (within 350 ms and 40 px) are a double-click, since browsers don't fire a dependable `dblclick` for them; a scene with these gestures also sets the SVG's `touch-action` (`manipulation`, or `none` with Drag & throw) so a double tap doesn't zoom the page and a drag doesn't scroll it, and restores it when the player stops.
- `burstSpeed`: px/s, default `250`: how fast the pieces of a burst body fly out from its centre.
- Gestures act on **the body under the pointer**, not on the whole object: one letter of a Text, one Clone copy, one piece of a burst body. Physics marks each body it can act on with its identity (runtime `body`) and the player picks the one whose outline holds the point.
- `drag`: **Drag & throw**, default `false`. In Play, pressing on a body of the group and moving more than 5 px grabs it by that point: a critically damped spring (about 4 Hz, like Matter.js's mouse constraint) pulls the grabbed point towards the pointer, so a rigid body held off its centre swings and a Soft Body stretches where it is held. Letting go removes the spring and the body keeps the speed it was given: a throw. A press that doesn't move stays a click (Click push), and the release of a drag is not a click. The pointer's path is recorded on scene time (runtime `scene.drags`, document coordinates) and replayed at the same simulation steps, so seeking back and playing again throws the same.

Rigid Body's `velocity` is the child’s initial `[x, y]` velocity in px/s; `spin` is its initial angular velocity in degrees/s. Filled contours, including interior holes, are used for collisions; open paths and stroke thickness are ignored. The simulation uses deterministic 120 Hz steps and is seekable and exportable. For a circular arena, use a hollow filled shape as an immovable child or select it under `solids`.

**A live world.** Physics keeps one world per effect that steps forward from frame to frame and remembers what happened: bodies born, gone or cut, and a snapshot every quarter second. Playing costs only the steps since the previous frame. When a body appears (a Mouse Instance click, a child that starts to exist, an Explosion), it joins the running simulation at that moment, at rest where it is (with its Rigid Body impulse); the other bodies go on exactly as they were, and nothing before that moment changes or is recomputed. Seeking back restores the nearest snapshot and replays what was recorded; a runtime copy whose birth lies after the new time disappears. Editing the scene (any parameter, shape or object other than runtime copies) starts the world again from 0. `time` goes up to 3600 s, so infinite interactive scenes can keep simulating; bind it to `scene.time`. Rigid bodies and Soft Body materials use the same world. A Gravity on a child adds its own pull and floor to that child's bodies (see Gravity).

**When the pieces change.** If what enters Physics changes over time (a Mosaic on a child whose rows are animated, an Explosion that starts, children that appear), the simulation does not start over with the new pieces. Physics reads its own input in the past (the engine evaluates the scene at earlier times with the stack cut right before Physics, on a quarter-second grid refined to the exact 120 Hz step of each change) and simulates stretch by stretch: at each change, every new piece starts where the earlier body it comes from was (the one of the same object that overlaps it most at rest), with its angle, its spin and the speed of that point of the body. A piece with no origin starts at rest where it is, with its own Rigid Body impulse. The result is the same playing, jumping or exporting; the first jump far into a long simulation costs one evaluation of the scene per sample, and later frames only search the time since the previous one. Changes of shape that keep the same pieces (an animated outline) carry each body over rigidly, with its state, at the frame they are seen. A re-cut that crosses earlier cuts (Mosaic recuts the whole source, not its pieces) gives each new piece the motion of the earlier piece it overlaps most. Effects that read their past declare `history: true` and receive `ctx.history`. The editor's **Lift & Sink** demo puts it together: a Physics group with an upward Acceleration (balloons rise), cells with their own Gravity (they sink), all Soft Body, two Mouse Instances in the group (click drops a cell, right-click releases a balloon with a palette colour per click) Click push (click a body to push it) Double-click burst (double-click a body to break it into pieces) and Drag & throw (drag a body and let go). **Fridge Magnets** does it without gravity: letter magnets (Text, one body per glyph) on a door, with Air drag so a thrown letter slides, knocks the others and stops.


### Rope (`rope`)

Every **open** path becomes a hanging rope pinned at its first and last point (closed paths are left alone): a Verlet chain whose links keep the length of the drawn path, so a path that already is a catenary stays at rest and a slack one drops and swings. Output is smooth cubics through the chain.

- `time`: seconds; left out, it follows `scene.time`.

The editor's **Wires** demo is a stress test: one Path with 48 slack open contours between two poles, Rope at 120 segments (about 5,800 particles), wind gusts from a `noise(scene.time)` formula and the Pointer bound to `scene.mouse` (Pointer in: Scene, Radius `0.055 * scene.mouse.inside`) so it parts the wires as it moves through them.
- `gravity`: fraction of the drawing size per s², default `1`. `wind`: sideways sway (same unit, default `0`), phased per rope and `seed`.
- `damping` (1/s), `stiffness` (constraint iterations, higher = less stretch; default 14), `segments` (chain links per path, 4–120; default 24). The cost grows with paths × segments × stiffness: 16 segments and stiffness 8 look the same on smooth threads and cost about a third.
- `pointer` and `radius` (fraction of the size, `0` = off): a round obstacle that pushes the ropes out of its way. `space: "box"` (default) reads `pointer` as fractions of the rope's box; `space: "scene"` reads it in px of the rope's own coordinates, which is what `scene.mouse.posX`/`posY` give: `pointer: [{ "$expr": "scene.mouse.posX", "fallback": 0 }, { "$expr": "scene.mouse.posY", "fallback": 0 }]`, `radius: { "$expr": "scene.mouse.inside * 0.07", "fallback": 0 }`. That replaces the follow + hover pair below, which still works. Bind `pointer` with a `follow` interaction (`stay: true`) and tween `radius` on `hover` so it only exists while the cursor is over the drawing.

It is **stateful**: the chain is stepped (120 Hz) from the last time shown. The state is cached on the input geometry (by object, or by a fingerprint of its open paths when an upstream effect such as Clone hands over a new object every frame), so two Ropes over the same drawing share one chain: duplicate the drawing if they need different settings. `settle` (seconds, default 0) pre-simulates the drawn pose falling into its rest shape before time 0, so a path drawn as a slack arc starts already hanging. Hanging threads need no precomputed paths: a `line` bent with Bend, cloned with Clone → Object → Inside a filled region, then Rope on the group. A jump back or a long jump forward restarts the chain at rest two seconds before and replays it with the current pointer; sequential frame export is deterministic. Obstacle motion is not recorded in exports (no pointer there). For a responsive pointer set `animation.fps` to 60: the player quantizes `scene.time` to the scene's fps and Rope only steps when it changes, so at 30 the chain reacts in 33 ms jumps; give the follow interaction `duration: 0` (no extra lag) and keep the hover tween that opens `radius` short.

#### Explosion → Gravity: inertia

Set Explosion's `motion` to `impulse` to launch pieces using `force` (source sizes/s), `spin` (degrees/s) and `amount` (impulse strength). In this mode Explosion leaves each piece in place instead of applying a position/angle offset. Follow it with rigid-body Gravity and animate Gravity's `time` from the burst: linear and angular velocity persist in free flight, then respond to floor friction and impacts. This also works with gravity set to zero. Shrink still changes the source geometry; use `shrink: 0` for a rigid launch.

The default `motion: "offset"` preserves Explosion's direct displacement/rotation behavior and also supplies a launch velocity to a following Gravity. Use `impulse` when the launch should be integrated entirely by physics, without adding a positional offset. Impulses are local geometry metadata, transformed with Transform/node placement and consumed by rigid-body Gravity; they do not render into SVG. Other deformations do not remap their velocity field.

Run `node scripts/bench-gravity.mjs` for stage-by-stage timings of the circle demo. It reports median, p95 and slowest engine evaluation after warm-up, plus sample frames. These are machine-dependent CPU timings; browser DOM updates and painting are excluded. The first seek to an uncached late frame still needs to simulate up to that time.


#### Collisions and solid targets

Under **Contacts**, enable **Collisions** to let the pieces of this Gravity collide, transfer momentum and stack. It defaults to `false` and does not couple separate Gravity effects. Select any number of **Solids** to use those scene objects as fixed collision obstacles (`solids: ["platform-id", "wall-id"]`). Selecting solids works independently of piece-to-piece collisions; rigid bodies must be enabled. The owner, its ancestors/descendants and effector nodes are excluded from the editor picker.

Contacts use the targets' evaluated filled paths in the Gravity object's local coordinates, including translation, rotation, scale and groups. Only each connected shape's exterior is used: holes and letter counters are filled, so an O behaves as a solid disc. (Physics keeps interior contours, so there a hollow shape can contain moving bodies.) Exteriors are triangulated and merged into convex parts. Disconnected letters/parts remain separate, with open gaps between them. Concave outlines are retained. Each body's collision outline is simplified at roughly 0.6% of that body's size (minimum 0.25 local units); rendered paths stay unchanged. This keeps small generated pieces from being simplified against the size of the full scene. Open paths and stroke thickness do not form solid obstacles. Friction and Bounce govern both the floor and object contacts; mass is proportional to filled area.

Targets are fixed during a replay, using the geometry and placement of the current frame. Animated target changes invalidate cached world states; their historical movement is not integrated and they do not receive forces from the falling pieces. Large initial overlaps may produce abrupt separation. Very fast movement through thin objects can require a thicker collider. A spatial index rejects distant target parts before SAT tests; static geometry, mass properties, simulation checkpoints and completed steps are reused.

Use `node scripts/bench-gravity.mjs --solids` to measure BOOM as a solid, or add `--collisions` to include fragment contacts. CPU timings exclude browser updates/painting. The first jump into an uncached time still costs more than continuing playback.

### Particles (`particles`)

A seeded generator, available in **Generate → Particles**, that duplicates the complete source object as particles. The source itself determines their geometry, colours and proportions; there is no particle-shape selector or object target. The source's bounding box supplies a stable reference for the emitter, sizes and velocities. Use **Color** after Particles for per-particle colour variation, or nest Color in Step for incremental hue changes; Particles itself preserves the source styling. When added in the editor, Time follows `scene.time` automatically; use the compact playback controls or scrub the scene. The emitter position, area and direction can also be dragged on the canvas.

- **Emission**: `burst` creates Count particles at time zero; `stream` emits Count particles per Lifetime seconds, keeping at most Count alive. Each birth has a stable id and seeded random values, so seeking needs no simulation history.
- **Source**: apply Particles directly to the circle, rectangle, star, text, SVG or group you want to emit. All its evaluated paths form one complete particle, preserving their colours and relative positions.
- **Time / Lifetime**: seconds. Time has no sixty-second cap and keeps evolving in Infinite scenes; particles disappear at the end of their individual lifetime. The default lifetime is 3 seconds.
- **Emitter**: `point`, `line`, `box`, or `circle`. `referenceSize: 0` preserves source-relative units; a positive pixel value supplies an independent square reference for area, particle size, speed, wind and gravity. Position is a normalized source-box point; Area is width/height in source-box fractions. The circular emitter samples uniformly inside an ellipse.
- **Motion**: Direction and Spread define a cone in clockwise degrees (−90 points up). Speed is source sizes per second, Gravity is source sizes per second squared. Speed variation and Size variation range from 0 to 1. Spin supplies a seeded angular velocity up to the given degrees/s in either direction; Rotation variation controls the initial orientation.
- **Emission controls**: `rate: 0` retains the legacy Count/Lifetime rate. A positive rate emits that many births per second, independently of Lifetime; Count and the complexity budget remain hard live-birth limits. `prewarm: true` evaluates the stream one maximum lifetime ahead so it starts populated. `lifetimeRandom` shortens each seeded life by up to that fraction without changing its other random attributes.
- **Organic motion**: `drag` exponentially damps launch velocity and gives gravity a terminal velocity. `wind` is a constant drift vector in reference sizes/second. `turbulence` adds smooth seeded displacement, starting at zero, with `turbulenceFrequency` in Hz; it is analytical wandering, not a spatial fluid/force solver. `swirl` rotates launch displacement in degrees/second. `alignToMotion` orients the source X axis along its instantaneous path; initial rotation and spin remain additive. These free-motion controls do not affect impulse births delegated to Gravity.
- **Appearance**: Size is the longest particle dimension as a source-size fraction. Particles preserve their source's colours. Fade out is the final fraction of life over which opacity falls to zero. `fadeIn` controls the initial fraction over which opacity rises, and `sizeEnd` is the terminal size multiplier (1 preserves size, 0 shrinks to zero). Keep source retains the emitter drawing as well; subsequent effects apply to that drawing too. **Stretch by speed** (`stretch`, 0–5, default 0) lengthens each particle along its direction of travel in proportion to its speed, for motion streaks (sparks, rain, fireworks): 1 doubles its length at a speed of one reference size per second, the width across stays, and the streak shortens as drag slows the particle. It combines with Align to motion, which turns the particle without lengthening it.

For bursts, `motion: "impulse"` leaves particles at their birth positions and passes velocity/spin to a following rigid-body Gravity. Animate Gravity's Time using the same clock as Particles. In this mode Gravity controls acceleration, floor contacts, collisions and solids; Particles' own Gravity is ignored. Stream emission always uses free analytical motion, because births have different ages; it does not replay a shared collision world with historical births.

Count is capped at 512 live particles and reduced for complex source objects to a budget of roughly 100,000 segments per frame. Multiple paths of one particle share a clone tag, so following effectors operate on the whole particle. The source bounds are computed once per evaluation, and stream evaluation visits only live births rather than all past particles.

Example: `apps/editor/public/demos/particles.json` contains a circle stream and a two-colour rectangle stream on a 1280×900 canvas. Additional validated studies are `particles-dust.json`, `particles-sparks.json`, `particles-confetti.json` and `particles-swirl.json` in the same folder. The Particles inspector offers ten motion presets: Dust, Sparks, Confetti, Fireworks, Fountain, Rain, Snow, Smoke, Bubbles and Swirl. Each sets its own Reference size, so it behaves the same whatever the size of the source; Rain and Snow emit from a wide line (place the source above the scene), Fountain, Smoke and Bubbles rise from it. Presets preserve the source artwork/colors, emitter position, seed and Time expression, and apply as one undo step. Color and Glow remain separate effects. The **Harbor Fireworks** demo in the editor's demo menu combines the Fireworks preset, Trace rocket tails, per-cycle `random()` and a Mirror reflection.


### Editor: new document dimensions

New editor documents start with a fixed 1400×900 frame centred at the origin. This also applies when the first primitive, imported SVG or pasted objects create a document. Opening an existing project preserves its saved frame or automatic sizing. Automatic sizing remains available in the document controls.


### Color: assigning a colour

In **Color**, select `solid` to assign a colour with the colour picker; Target chooses `fill`, `stroke`, or `both`. Shapes with `fill: none` stay unfilled and missing strokes are not enabled. Newly added Color effects in the editor start in Solid mode. Existing scenes keep their stored mode; the headless schema default remains Shift for compatibility. Shift, Gradient and Random remain available for variations, including inside Step.


### Filling a shape with other objects

For a regular pattern, create a small Cross, apply **Clone → Grid**, then **Mask** with a triangle as its source. Make the grid cover the whole triangle and hide the triangle itself: hidden objects still work as masks. Enable **Whole elements** in Mask to discard boundary-crossing copies and keep every cross complete. With it off, the mask trims the crosses at the boundary. For a random distribution, use **Clone → Object → Inside** and select the triangle; this places particle centres inside it, and an additional Mask trims any arms crossing its border.

`apps/editor/public/demos/cross-fill.json` is an editable regular-grid example on an 800×650 document. Size and Width belong to the source Cross; Columns, Rows and Spacing belong to Clone; the triangle controls the mask.

Clone Grid sliders support up to **64 columns × 64 rows**, with a quadratic slider curve for finer control at small counts. Columns and Rows can be linked to change proportionally. Count is hidden in Grid: the total is Columns × Rows.

Grid can optionally pack large 2×2 copies. Set **Pack large copies** to `2x2`, then set **Big / normal**, **Gap** in pixels, and the seed. A large copy is exactly twice the source width and height. The generator reserves its four cells before placing normal copies, so the grid copies do not overlap. Each copy stays a separate element and can be varied with Range, Step or other effectors.


### Clone: concentric radial rings

In **Clone → Radial**, **Rings** chooses 1–64 concentric circles; **Count** is the number of copies on each ring. **Radius** sets the innermost radius and **Ring spacing** adds the distance between successive radii, in source-size fractions. Both ring controls support animation; fractional ring counts are rounded. Copies keep unique element tags, ordered from the innermost ring outwards, so Step and Color work across the whole result. Selecting Clone shows all rings on the canvas, with a handle for spacing. One ring preserves the previous radial result.

### Arrow primitive

`arrow` generates a continuous closed outline pointing right. `length` (240 px) and `width` (24 px) set its total length and body thickness. `startHead` (default `none`) and `endHead` (default `triangle`) independently select `none`, `triangle`, `v`, `square` or `circle`. Different head types can be combined; both `none` produces a plain body. `headLength` (0.28, 0.01–0.5) is the head length divided by total length; `headWidth` (3, 1–12) multiplies body width. The round head is elliptical when these proportions differ. `notch` (0.45, 0–0.9) controls V depth. All numeric dimensions/proportions support animation and expressions; rotate the node to change direction. Heads and body share one outline, including cubic curves for round heads, so stroke never draws internal seams.

### Oscillate and Wiggle — time modulators

Both are effector containers: nest Transform, Color, Opacity or another non-effector inside `children`. Numeric child parameters vary from their neutral values to the configured amplitudes: Transform `y: 30` means ±30 px, `rotation: 15` means ±15°, and `scale: 1.2` means 0.8–1.2 at full bipolar strength. Color in shift mode modulates hue, saturation and lightness. Non-numeric choices (including solid color) do not interpolate. Child parameters marked `ramp: false` remain fixed. Range and Field can contain Oscillate, Wiggle, Pulse or Shake; the selector gates each signal to its elements, scales signal Amplitude and Offset by its weight, and preserves original Clone indices for per-element phase or delay.

- `time` (seconds) follows `scene.time` when it is left out, as in Particles, Gravity and every effect with a Time. Replace it with a number to freeze, or an expression such as `scene.time * 0.5` to use a slower local clock.
- `frequency` (Hz, default 1, slider 0–20), `amplitude` (default 1, slider 0–2), `offset` (default 0, slider −2–2), `phase` (degrees, default 0). The signal is `offset + amplitude × waveform`.
- `perElement` (default true) gives each clone/glyph its own pivot and signal. `elementPhase` (degrees per element, default 20) adds phase progressively. Disable Per element to apply to the entire drawing with one pivot.
- **Oscillate** (`oscillate`): `wave` is `sine` (default), `triangle`, `square` or `saw`; each has a bipolar range −1 to 1.
- **Wiggle** (`wiggle`): smooth bounded seeded noise, with `seed` (default 1). In Per element mode each element has an independent signal. Seeking, reverse playback and export are deterministic, without simulation history. Frequency zero freezes the signal at its phase.

In the editor both start with a Transform child so they work immediately. The example `apps/editor/public/demos/motion-crosses.json` combines independent rotation/drift with a phased wave of position, scale and hue, without keyframes.

### Pulse and Shake — rhythm and impacts

Like Oscillate and Wiggle, these are effector containers with non-effector children. The editor adds a Transform child and a `time: { "$expr": "scene.time", "fallback": 1 }` clock. Numeric child values set motion amplitudes relative to their neutral values. Both support deterministic seeking and export, including reverse local clocks.

- **Pulse** (`pulse`) uses the shared Time, Frequency, Amplitude, Offset, Phase, Per element and Element phase controls. Its signal is unipolar (0–1) before amplitude and offset. `attack` (default 0.1) and `decay` (default 0.4) are fractions of a cycle, with smooth transitions and rest for the remainder. If their sum exceeds 1, both are proportionally shortened to fit one period. Zero attack gives an immediate hit; zero decay returns immediately after the peak. Both zero produce rest. Frequency zero freezes at the specified phase. Default child: Transform scale 1.2.
- **Shake** (`shake`) is a single decaying seeded disturbance. `start` (default 0 seconds), `duration` (default 1 second), `frequency` (default 8 Hz), `amplitude` (default 1), `decay` (default 2; higher settles faster), `seed` (default 1). It is exactly neutral before Start and at/after Start + Duration. `perElement` defaults false so the object moves as one body; enabling it gives independent signals, local pivots and an `elementDelay` (default 0.04 seconds per element). Default child: Transform x 12, y 8, rotation 3°. Shake does not repeat by itself; loop/remap its Time expression to repeat hits.

The example `apps/editor/public/demos/rhythm-crosses.json` pulses five crosses and sends one delayed impact through them at 2 seconds, without keyframes.

### Layers — splitting a scene into work zones

A layer is a top-level `group` with `layer: true`. When a scene uses layers, **every** top-level object is a layer and the objects live in their `children`; layers are never nested. The first layer is drawn in front, like any `objects` list. A scene without layers is one implicit layer: existing files need no change.

Layers only organize: no effects, transform, opacity or blend (validation warns if they carry any; opacity/blend would apply per object, not to the layer as a whole). `visible: false` keeps the layer in the project JSON but leaves it out of rendering and every export (SVG, PNG, video, Lottie). `locked: true` locks everything inside it in the editor. Ids stay unique across the whole scene, so references (Instance, Mask, Mouse target…) work across layers. A Mouse Instance inside a layer draws its copies at the front of that layer. Each composition's scene has its own layers.

```json
{
  "version": 1,
  "objects": [
    { "kind": "group", "id": "layer-ui", "name": "UI", "layer": true, "stack": [], "children": [ { "kind": "shape", "id": "title", "name": "Title", "shape": "text", "params": { "text": "Hello" }, "stack": [] } ] },
    { "kind": "group", "id": "layer-bg", "name": "Background", "layer": true, "visible": false, "stack": [], "children": [ { "kind": "shape", "id": "sky", "name": "Sky", "shape": "rectangle", "params": { "width": "100%", "height": "100%" }, "stack": [] } ] }
  ]
}
```

In the editor, the Layers panel (above the Stack) adds, renames, reorders, hides, locks and deletes layers; the Stack lists only the active layer, new objects go into it, and "Move to…" sends the selection to another layer. Selecting an object on the canvas activates its layer.

### Compositions — nested scenes and local clocks

A composition is stored as a group with empty `children` and a `composition` containing its isolated SceneV1 and clock parameters. It stays a single selectable object in the parent; its child scene is expanded only for rendering. Local node/effect IDs can repeat in other compositions; references resolve within their own scene. Files remain SceneV1 JSON and project files embed all nested scenes.

```json
{
  "kind": "group", "id": "comp-1", "name": "Composition", "children": [], "stack": [],
  "composition": {
    "scene": { "version": 1, "document": { "width": 1400, "height": 900 }, "objects": [] },
    "params": { "time": { "$expr": "scene.time", "fallback": 0 }, "speed": 1, "loop": "hold" }
  }
}
```

- **Utils → Empty composition / Composition from selection / Import composition…**. Import accepts project JSON and SceneV1 JSON without replacing the current project. A selection must share a parent; include linked objects/targets so references are not broken. Its tracks and interactions move into the child scene, retaining paint order and placement.
- Select the composition and use **Open composition** in the inspector. Its objects, document, notes and timeline are edited locally. The toolbar breadcrumbs return to ancestors and restore the parent playhead. Saving and undo/redo always retain the whole project, even while editing inside it.
- `time` is evaluated in the parent scene; by default it follows parent time. `start` holds the first local frame until that parent time. `speed` multiplies elapsed time (0 freezes; negative plays backwards with a suitable offset). `offset` is added in seconds. `reverse` reverses the resulting local clock. `loop` is `hold` (clamp to the child duration), `loop`, or `pingpong`.
- Local keyframes, numeric/text expressions, temporal effectors, Particles and Gravity receive this local clock. Numeric clock fields accept expressions for remapping. Each nested scene uses its own duration and FPS. Missing parent timelines derive a duration from their compositions.
- Position, scale, rotation, opacity, blend and effect stacks act on the composition in the parent. The child document provides a stable transform frame, including empty scenes. Its frame does not crop content in this first version. Interactions of internal objects are retained and can be tested while the child is open; dispatching them from the parent is pending. Native masks/filters retain the existing group rendering semantics.
- Cyclic or deeper-than-32 nesting is rejected. Existing document caches still reuse unchanged geometry/effect results; exporting SVG/PNG and sampled animation evaluates the same nested scene clocks.

The example `apps/editor/public/demos/compositions-boom.json` places two copies of the BOOM demo side by side at normal and 60% speed.

### Time Remap, clock signals, stop motion and markers

Composition numeric clock fields support tracks with `on: "composition"`: `time`, `start`, `speed`, `offset`, and `frameRate`. Use **Animate time** in the inspector to replace the default scene.time expression with a numeric key at the playhead. Editing Time then auto-keys an existing track; equal values or hold easing freeze a frame, descending values rewind. **Follow scene time** restores the expression and removes the Time track. Expressions have the usual priority over keyframes on the same field.

`composition.modulation` optionally stores `{ type: "oscillate" | "wiggle" | "pulse" | "shake", params, enabled? }`. **Clock signal** selects it in the inspector. These share the exact signal schemas with their geometric effects; amplitude and offset are seconds added to the primary remapped clock before wrapping/reversal/quantization. Signal Time follows the parent clock unless overridden. A single composition has one signal; Per element controls do not apply to its clock.

**Playback FPS** (`frameRate`, default 0 = free) quantizes the resulting local time downward to intervals of 1/FPS. This can run an 8- or 12-FPS composition in a 30-FPS parent; child expressions, particles and physics all use the same sampled instant. The exact final frame is retained when playback is held at the child's duration.

`animation.markers` is an optional array of `{ id, name, t }` in scene-local seconds. Add markers at the playhead with the timeline flag button, rename/change time/remove them in the Markers list, and click their ruler flags to seek. The compact playback controls offer **Markers** jumps even with the timeline closed. A composition's **From marker** picker copies a child marker's time into Offset. Markers are scoped to each scene and preserved in projects, navigation and undo; shortening the timeline clamps them to its duration.

The example `apps/editor/public/demos/time-remap-boom.json` demonstrates keyed clocks, a hold, reverse playback, a clock signal and 8-FPS stop motion across three staggered copies. The editor's **Title Sequence** demo keys a title card's composition Time to play, freeze, rewind and play out, so the card's own `{{fixed(scene.time, 2, 2)}}` timecode runs backwards during the rewind.

### Scaling multiple selected objects

With several objects selected, canvas corner handles scale the entire selection about its combined document-space bounding-box center. Geometry sizes and spacing change proportionally; no group is created. The inspector's Scale field/slider applies the same relative factor to the selection. Parent/child selections are deduplicated to avoid double transforms; nested group placements and existing x/y/scale tracks are updated, and each drag is one undo operation.

### Spikes (`spikes`) — regular tips along an outline

A deformer that walks each path by length and raises `count` evenly spaced tips, `height` px along the outline's normal (negative values point inwards). On a circle it gives a sunburst, a badge or a flower.

- `count` (number, default 12, 1–200): tips per path.
- `height` (number, default 30, px, −500–500): how far each tip stands out.
- `curve` (number, default 0, −1–1): the sides. `0` is straight; towards `1` they hollow out like thorns; towards `−1` they bulge like petals.
- `width` (number, default 1, 0.05–1): the share of its stretch each spike takes; the rest keeps the original outline.
- `lean` (number, default 0, −1–1): tilts the tips along the outline.
- `phase` (number, default 0, 0–1): slides the row along a closed outline (1 = one whole spike).

```json
{ "id": "spikes-1", "type": "spikes", "params": { "count": 12, "height": 35, "curve": 1 } }
```

Curved outlines are walked as fine polylines, so the stretches left between spikes (`width` below 1) become straight segments. A spike that straddles a sharp corner can cross itself.

## Mouse Instance

Add **Utils → Mouse Instance**, choose a source object/group in **Of**, then enter **Play**. Input is received anywhere on the SVG canvas, including its empty background. The source may be hidden; its generated copies still render. Mouse Instance has its own mouse icon in the layer list.

A Mouse Instance is an instance node with a `mouse` configuration. It draws nothing in the editor or in a headless render. The player generates temporary copies without changing saved scene objects. Each copy starts the source's animation at local time zero, holds its final frame, and disappears after `lifetime` seconds. A composition source keeps its own playback settings. `lifetime: 0` keeps copies until newer copies replace them at `limit`. Stopping/restarting Play clears generated copies. SVG/MP4 timeline exports do not record mouse input; a Play frame capture includes the visible copies.

```json
{
  "kind": "instance",
  "id": "mouse-brush",
  "name": "Mouse Instance",
  "of": "source-object-id",
  "stack": [],
  "mouse": {
    "event": "move",
    "button": "left",
    "rate": 20,
    "distance": 8,
    "count": 1,
    "lifetime": 3,
    "limit": 100,
    "offset": [0, 0],
    "scale": 1,
    "rotation": 0,
    "scatter": 0,
    "scaleVariation": 0,
    "rotationVariation": 0
  }
}
```

- `event`: `click` (default), `double-click`, `right-click`, `middle-click`, `move`, `wheel-up`, `wheel-down`. Multiple Mouse Instance nodes can listen to different events.
- `button`: for movement only, `any` (no button required), `left`, `right`, or `middle` (must be held).
- `rate`: maximum emissions per second (default 20, 0.1–120), with no queued emissions. Movement also requires `distance` pixels since the last emission (default 0).
- `count`: copies per emission (1–50). `limit`: maximum live copies per generator (1–500); oldest copies are removed first. `lifetime`: seconds, default 3; zero keeps copies.
- `offset`: canvas coordinates relative to the cursor; `scale` and `rotation`: additional transform on the source; `scatter`: random ±px per axis; `scaleVariation`: random relative scale (0–1); `rotationVariation`: random ±degrees.

**Inside a group.** A Mouse Instance placed in an ordinary group (not a layer or a composition) puts its copies in that group, in its own place in the children, so the group's effects treat them as its own children. With **Physics** on the group, every click adds a body to the running simulation (see Physics → A live world): click empty space to drop a new cell into a pile. Those copies live on scene time: each remembers its birth time, does not exist before it (seeking back before it removes it for good) and runs its own animation from that moment.

The source's initial local position is aligned with the cursor; its scale, rotation, effects and subsequent position animation are retained. Its parent placement does not affect cursor positioning. Generator transform controls are replaced by the explicit mouse offset/scale/rotation controls. The generator's effects, opacity and blend apply to its copies. Right-click and wheel suppress browser defaults only when a matching generator handles the input. A double-click also produces the browser's normal click events, so separate click generators respond too. Mouse generators inside nested compositions are not activated; place them in the outer scene and use the composition as their source.

## Full viewport

**Document → Size → Full** (Full viewport) is off by default. Enable it to fill the complete viewport in Play/shared Play, without the usual presentation margins. The editor retains its saved document size, canvas margins and bounds as a reference. **Fit** chooses how the document meets the screen, as CSS `object-fit`: **Contain** (default) shows all of it without distortion, with bands where the aspect ratios differ (`preserveAspectRatio="xMidYMid meet"`); **Cover** fills the screen without distortion and crops what overflows (`xMidYMid slice`); **Stretch** maps the document edge to edge on both axes and distorts it (`none`), so objects on its edges stay at the viewport edges.

The setting is saved as optional `SceneV1.fullViewport`: `true` (contain), `"cover"` or `"stretch"` (`"contain"` is also accepted). Document dimensions and geometry stay unchanged in the editor and in headless exports. Both the editor's full-screen Play and the shared-link Play size their SVG to the full viewport. Embedded pages should size their SVG to the intended viewport; `createPlayer` applies the same edge-to-edge mapping. Mouse Instance coordinates use the SVG screen transform, including this scaling.

Optional `SceneV1.clipToDocument: true` (**Document → Clip**) hides in Play whatever lies outside the document: by default drawing overflows the stage and shows in Contain's bands. `createPlayer` sets a CSS `clip-path: inset(…)` on the SVG from where the viewBox lands on screen, and updates it on resize and when the viewBox changes. The Canvas renderer already stops at the viewBox; headless exports are unaffected (they already end at the document). The editor's View → Hide outside is a separate, editor-only view setting.

## Infinite time

Enable **Document → Time → Infinite** or **Timeline → Infinite** for procedural/interactive scenes that should never stop. Infinite is off by default, persists as `animation.infinite: true`, and works in editor timeline playback, the editor's full-screen Play and shared-link Play. Scene Loop is disabled while Infinite is on: the elapsed clock advances beyond duration instead of wrapping. The configured duration and timeline stay available. After the first duration window, tracks hold their sample at the window's end; expression and procedural clocks keep running. Track repeats are evaluated within that first window and then held too.

```json
{
  "version": 1,
  "animation": { "duration": 10, "infinite": true, "loop": false, "fps": 30, "tracks": [] },
  "custom": {
    "variation": { "$expr": "scene.cycle", "fallback": 0 }
  },
  "objects": [
    {
      "kind": "shape", "id": "procedural-star", "name": "Procedural star",
      "shape": "star",
      "params": { "radius": { "$expr": "80 + sin(scene.time) * 20", "fallback": 80 } },
      "stack": []
    }
  ]
}
```

`scene.cycle` counts completed duration windows: `floor(scene.time / scene.duration)`, starting at zero (zero for non-positive duration). At time 180 in a 10-second scene, `scene.cycle` is 18. It works in numeric parameter expressions, custom formulas and text such as `Cycle {{scene.cycle}}`. The cycle counter does not restart playback. `scene.duration` stays 10 and `scene.progress` stays at 1 after 10 seconds, while `scene.time`, `scene.frame` and `scene.cycle` can continue increasing. With regular finite playback, cycle follows the sampled scene time; a normal scene loop resets that time, so this is not a cumulative counter of normal loops.

To loop authored motion, use a composition with `params: { time: { "$expr": "scene.time", "fallback": 0 }, loop: "loop" }` inside the infinite parent. A child composition owns its remapped clock and duration: its own `scene.cycle` is based on that local time and may reset on a child loop. `loop: "hold"` still holds the child at its duration. Infinite does not override composition playback settings.

The timeline ruler, key editing range and scrubber retain the configured duration. The playhead stays at the end after that window, while the elapsed counter continues. Pause/resume preserves elapsed time; Go to start resets it. Editing duration in Infinite mode preserves elapsed time and updates the cycle calculation. Turning Infinite off clamps editor time to duration and leaves Loop off. Enabling it stores `loop: false`; imported scenes with both flags set prefer Infinite and receive a validation warning.

For headless use, `sampleScene(scene, 180)` sets elapsed `at: 180`, holds timeline tracks at duration, and allows the engine to resolve expressions at 180 seconds. Exporting SVG animations, PNG sequences or video still renders the finite interval specified by duration; Infinite neither starts an endless export nor captures live input. Reduced-motion playback retains the player's existing non-animating behavior.

## Re-seeding on a beat (`seedEvery`)

`seedEvery: 1` on SceneV1 (seconds; 0 or absent = off; editor: **Document → Seed generator → Every**) gives `scene.seedGenerator` a new value each interval of scene time: the base seed plus 7919 per elapsed interval, so seeds offset by small numbers (`scene.seedGenerator + 10`) never collide across intervals. Everything linked to the generator (effect seeds, `random()`, layouts) changes on that beat, and the same time always gives the same seed, in Play and exports alike. Compositions without their own seed follow the parent's live seed. Combine it with `animation.infinite: true` for an endless sequence (a looping timeline repeats the sequence each loop). It makes the scene time-driven.

## Random in expressions (ƒx)

`random(min, max, seed?)` returns a deterministic continuous random value. It is available wherever numeric expressions are accepted, in document custom variables and inside Text interpolation. It uses `scene.seedGenerator` as the base seed, combined with an optional numeric salt (third argument, default 0). Change the document seed with its dice to get a new result. Equal seed pairs reproduce the same result regardless of time, field evaluation order or seeking, including headless exports; no mutable random sequence is consumed.

| Formula | Behavior |
| --- | --- |
| `random(0, 100)` | Stable until the document seed changes. |
| `random(-10, 10, scene.cycle)` | Changes per duration window with Infinite time. |
| `random(0, 100, scene.frame)` | Changes per frame. |
| `random(0, 100, floor(scene.time * 2))` | Changes twice per second. |
| `random(0, 100, scene.cycle + 1000)` | Separate variation from the same cycle counter. |
| `floor(random(0, 6, scene.cycle)) + 1` | Integer from 1 to 6. |
| `{{fixed(random(0, 100, scene.cycle), 2)}}` | Text interpolation with two decimal places. |

The third argument supplements the document seed; it does not replace it. Identical seed/salt pairs produce correlated values in separate fields, so assign different salts for independent variation. Fractional and negative salts are supported without truncation. `random(100, 0)` normalizes the reversed bounds; equal bounds return that number. Values normally lie in `[min, max)`. All inputs must be finite; runtime errors use the numeric expression's `fallback`. This is part of the expression language, not `Math.random()` or JavaScript.

Example numeric field: `{ "$expr": "random(40, 120, scene.cycle)", "fallback": 80 }`. A custom variable can store the same formula and be referenced with `scene.custom.name`. Compositions use their own/inherited seed and remapped local time, so their random variation follows their local `scene.frame`/`scene.cycle`.

### Mouse Instance expressions

All Mouse Instance numeric controls accept ƒx: Rate, Min distance, Copies / event, Life, Max copies, Scale, Rotation, Position variation, Scale variation and Rotation variation. Offset X and Offset Y each have a separate ƒx control; JSON keeps them in `mouse.offset: [x, y]`, with a number or numeric expression per component. Event, While pressed and source remain selectors.

Formulas resolve when input arrives using the **parent scene's current playback clock**, fps, duration, cycle, document seed and custom variables. This is independent of browser uptime and of each copy's local animation clock. Rate, minimum distance, count and limit are sampled per input event. Birth properties (transform, lifetime and variation) are sampled separately for every generated copy, including copies from the same emission; each stores its own result. Later events reevaluate the configuration and do not change existing copies. Rate and distance formulas are evaluated before throttling input. The player uses the same clock for input sampling and frame rendering, including Infinite mode and finite scene loops.

Example `mouse` configuration:

```json
{
  "event": "click",
  "count": { "$expr": "2 + scene.cycle", "fallback": 2 },
  "lifetime": { "$expr": "scene.custom.life", "fallback": 3 },
  "rotation": { "$expr": "random(-180, 180)", "fallback": 0 },
  "scale": { "$expr": "random(0.5, 1.5, scene.frame + 1000)", "fallback": 1 },
  "offset": [
    { "$expr": "random(-20, 20, scene.frame + 2000)", "fallback": 0 },
    { "$expr": "random(-20, 20, scene.frame + 3000)", "fallback": 0 }
  ]
}
```

Keep finite fallbacks. Invalid formulas use their fallback; invalid non-finite results/fallbacks use safe numeric defaults. Copies per event and Max copies are floored and capped at 50/500, Rate stays within 0.1–120/s, scale stays positive and life/distance/variation distances are non-negative. Scale variation stays within 0–1. A lifetime of zero keeps copies subject to the limit. `random(min, max)` inside Mouse Instance config uses an implicit deterministic birth-index salt, so each copy receives a fresh value, including several copies emitted by one event. Explicit third arguments override that salt: `random(0, 90, scene.cycle)` intentionally shares a value for that cycle; `random(..., scene.frame)` shares a value within the sampled scene frame. Outside Mouse-generated copies, omitted seeds still default to 0 and remain stable. Runtime geometry is still temporary and saved formulas remain intact.

Mouse random example: set Rotation to `random(0, 90)` to give each emitted cross a distinct angle that remains fixed after birth. Replaying the same accepted emission sequence with the same document seed reproduces those values. Other numeric birth properties and custom-variable random formulas evaluated for that config use the same per-copy context.

Mouse Instance also propagates its implicit per-copy random salt into the source object's shapes, effect stacks (including Paint Amount), custom-variable formulas, text expressions and nested source compositions. `random(0, 1)` in a Cross source's Paint `fillAmount` gives each generated copy its own mix amount, stable over its lifetime. Explicit third arguments still override per-copy variation. The source's saved formula and document seed stay unchanged. Generated composition wrappers carry the runtime `composition.randomSalt` context; agents should not add this field to authored scene JSON. Paint Amount mixes the base fill with Paint's fill color, so choose different colors to see variation.

## Color Palette with Mouse Instance

For an exact random color from a list, add **Color** to the Cross/source, set **Mode → palette** and keep **Choose → random**. The Palette section starts with five editable color pickers; use + or × to add/remove colors (at least one remains). Set Target to fill, stroke or both. This replaces the target with one exact palette entry, without blending neighboring colors. Each accepted mouse input picks a new random palette entry; all copies created by that one emission share the pick. The next click may legitimately pick the previous color again. The choice stays stable across frames with the default seed, and the saved source remains unchanged.

```json
{
  "id": "palette-color",
  "type": "color",
  "params": {
    "mode": "palette",
    "palette": ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff"],
    "paletteMode": "random",
    "seed": 1,
    "target": "fill"
  }
}
```

Palette entries are a non-empty `#rrggbb` array. The document seed, Color's Seed and accepted emission sequence determine the choices reproducibly. Throttled input does not consume a choice. Movement/wheel/other mouse triggers follow the same rule per accepted emission. Source compositions inherit the emission context. A static scene outside Mouse uses the effect's Seed for a stable choice.

For manual/procedural selection, choose **index** and set numeric/ƒx `index`; index 0 is the first entry, fractional values are floored and out-of-range/negative indices wrap. Explicit index mode bypasses automatic per-click selection. Empty/malformed palettes fail validation; runtime rendering safely ignores an empty palette. None/transparent fills are preserved, and stroke targeting follows the existing Color behavior.

**Color → random** remains a different mode: it varies hue/lightness according to Variation rather than restricting the result to the palette. In Mouse Instance it now uses a distinct seed per generated copy, including multiple copies from one click, and retains its color with the default static settings. Use Variation > 0 to see a difference. This per-copy rule applies whether Color is on the generator's own stack or on its source/nested source composition. **Palette** deliberately picks per emission instead.

## Mouse Instance Target area

Mouse Instance's **Target** optionally limits where its input is accepted. Create a rectangle covering the desired part of the scene, select it as Target, and hide it in the layer list. Hidden target geometry still gates clicks, double/right/middle clicks, movement and wheel events in both Play hosts. No Target means the whole SVG canvas. Source (**Of**) and Target are independent references.

Example: an invisible rectangle makes only the left half interactive:

```json
{
  "version": 1,
  "document": { "width": 800, "height": 600 },
  "objects": [
    {
      "kind": "instance", "id": "mouse", "name": "Mouse Instance",
      "of": "cross", "stack": [], "mouse": { "event": "click", "target": "left-half" }
    },
    {
      "kind": "shape", "id": "cross", "name": "Cross", "shape": "cross",
      "params": { "size": 80 }, "visible": false, "stack": []
    },
    {
      "kind": "shape", "id": "left-half", "name": "Left half", "shape": "rectangle",
      "params": { "width": 400, "height": 600 }, "transform": { "x": -200 },
      "visible": false, "stack": []
    }
  ]
}
```

The player tests the target's evaluated closed contours in document coordinates, including transforms, effects and animation, rather than just its bounding box or DOM hit-testing. Fill/stroke color, opacity, visibility and filter extents do not define the area. Target contours respect nonzero/even-odd holes; borders are included. Use a closed shape (a line alone has no interior). A missing/deleted target accepts no input, with a validation warning. Input outside the target does not emit copies, consume palette choices, update the rate/distance gate or suppress browser context-menu/wheel defaults. Full viewport screen transforms still map input into the same scene coordinates.

Set `mouse.target: "<node-id>"` in JSON; the reference belongs to the same scene scope. Direct runtime callers pass the evaluated `DocumentResult` as the sixth argument to `.event(kind, point, monotonicSeconds, buttons?, sceneTime?, document?)`; `createPlayer` supplies the currently displayed document automatically. Input with a target and no geometry context is ignored. Composition extraction checks target references; pasted targets remap when copied alongside their generators.

The Mouse Instance inspector contains its source, target and generation controls; it omits the generic Display, Interactions, Animate, Pack/Group/Remove blocks. Use the layer list to toggle/remove the generator. The effect stack remains available; animate or style the source to define what its emitted copies do.

## Mouse output and chained effects

Mouse Instance generates a live collection of placed copies. Its normal modifier stack applies once to that collection, in stack order, after each source copy has evaluated its own geometry/effects/animation. This is a reusable pipeline rather than a Mouse-specific symmetry setting.

For reflection from a left-side Target into the right half, add **Mirror** to Mouse Instance's stack. Choose **Reference → Limit**, **Axis → horizontal**, **Axis at → 1**, **Original → keep**:

```json
{
  "id": "mirror-click-output",
  "type": "mirror",
  "params": { "reference": "left-half", "axis": "horizontal", "position": 1, "original": "keep" }
}
```

Mirror's optional `reference` is a general node parameter: it measures that node's evaluated bounds (including hidden objects) in the effect owner's coordinate space. Position 1 is its right/bottom edge, 0.5 its center. Empty Reference preserves the existing behavior based on the input bounds. Mouse Target gates original input only; reflected output may appear outside it.

Mirror now receives the copies already placed, so it reflects their complete animated results, color and handedness. Stack order matters: Mirror then Transform moves both sides together; Transform then Mirror reflects the moved source result. Chain a second Mirror (vertical) for four-way reflection, or add Color, Clone, deformers and effectors normally. Put per-copy effects/animation on the source; put effects intended for the entire generated result on Mouse's stack. Generator-stack expressions use the parent scene clock; source expressions use each copy's local clock.

The runtime collection has the generator's ID, so references can address its evaluated result. Stable element/emission metadata keeps Color Random choices per birth and Color Palette choices per click when new copies arrive. Mouse limit/lifetime govern source births; geometry produced by downstream Mirror disappears with its source birth. No extra Mouse symmetry options are stored. Generated collections and click history remain temporary in Play; authored JSON keeps the Mouse generator plus ordinary effects.


## Wire view and selection

Press **W** in the editor or either player to switch the evaluated geometry to Wire. The views share body classification, palette and screen-sized hatch patterns: mobile bodies use cyan, fixed bodies use yellow. Wire changes presentation only. Its invisible interaction geometry retains the original fills, stroke widths, opacity and masks, so selecting, dragging and clicking use the same areas as normal rendering. Wire is never saved as scene paint or exported.

In the editor, selecting a Range in the stack highlights only the elements that Range affects. Five stable colours distinguish different Ranges, one active highlight at a time; no new random colour is sampled during playback. Switching to an object or a different kind of effect clears the Range highlight. Range preview also works before adding children. View zoom changes pattern scale, not evaluated scene geometry.


## Manual Path primitive (0.0.4)

`shape: "path"` stores editable source contours in `params.contours`. Each contour has `closed: boolean` and `points`, with each point storing `point: [x, y]`, `in: [dx, dy]`, `out: [dx, dy]`, and `mode: "corner" | "free" | "smooth" | "symmetric"`. Handles are offsets from their anchor in local pixels. Corner removes handles; Free moves them independently; Smooth links their angle while retaining separate lengths; Symmetric links angle and length. Multiple contours share the shape's fill/stroke and procedural stack.

Path coordinates have a stable local origin `[0, 0]`; editing a point does not recenter the source. With the default transform pivot, rotation/scale use that origin, so unchanged points stay put when editing transformed paths. Explicit user pivots keep their existing fractional-bounds meaning. Effects continue to operate on the updated source; editing does not bake the result.

In the editor, use Path (pencil) to click corners or drag symmetric Bézier handles. Enter or double-click finishes an open path; click its first anchor to close a path of at least three points. Use **Edit points (N)** below the object selector, then click a Path, or double-click an existing Path/press Enter to edit. Drag anchors and handles; Alt-drag a handle breaks linkage and Shift constrains the drag to an axis. The toolbar switches node modes, adds points or contours, toggles closure and removes points. Double-click a source segment to insert a node using exact cubic subdivision. Arrow keys move the selected anchor (Shift: ten pixels); Delete removes it; Escape/Enter, the close icon, another tool or a double-click on empty canvas exits. The Path toolbar is centered below the canvas selection and fits its icon controls. Each completed drag is one undoable edit.

### Text editing (0.0.4)

Ordinary text is edited on the canvas by double-click or Enter. The inspector groups typography (font, weight, italic, size), Text layout (align, tracking, line height, anchor), and Dynamic text. It has no content textarea. **Text ƒx** opens a resizable lower panel with a template editor, insertion presets, expression tips and the same text zoom/copy/maximize controls as Notes. Convert to plain text freezes the evaluated template at the current editor time, keeps its evaluated anchor and supports Undo. The Clock preset runs on real local time in Play and displays `00:00:00` in the canvas/headless exports. A text containing `{{…}}` opens that panel on double-click/Enter and shows a green ƒx badge outside the upper-right corner of its selection. Dynamic text's **Update rate** is the last property, under Text playback.


#### Path point selection and animation

The Edit points tool uses its own cursor. Drag empty canvas to marquee-select source anchors; Shift extends the selection, and Shift-click toggles individual anchors. Dragging a selected anchor moves the selected anchors together; arrow keys and point-mode controls affect the selection. These gestures do not move/select whole objects. Double-click a segment's widened hit area to insert a point without changing its cubic geometry. The overlay follows canvas resize, panel changes, zoom and pan.

**Alt/Option-click an anchor** adds or replaces its position keyframe at the current timeline time. It does not drag the point or remove an existing key. Change time, move a point, then Alt-click again to author another position; moving a point at an existing key updates that key. Keyed anchors are marked on the canvas and their tracks are named Point N → Position. Position keys interpolate as `[x, y]` pairs before the procedural effect stack.

Animated points have an optional stable `id` (unique within their Path). A normal shape track targets `param: "point:<id>:point"`; `:in` and `:out` address handle offsets for headless authoring. Inserting a point does not retarget existing animation. Removing a keyed anchor removes its tracks in the editor; Undo restores geometry and keys together.
