# Comprehensive svertik Engine & Effects Guide

> **Technical Reference for AI Agents & Headless Developers**  
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
      params: { radius: 150, innerRadius: 75, points: 6, fillColor: '#09fdd1' },
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
6. **Expressions:** Supported numeric parameters, including effect seeds, may use `{ "$expr": "...", "fallback": 12 }` instead of a number. Expressions are evaluated per frame with `scene.time` in seconds, `scene.frame`, `scene.fps` (30 by default), `scene.duration`, `scene.progress`, `scene.seedGenerator` (the scene-wide random seed, 1 by default), `scene.width` and `scene.height` (the document's size; 0 when the scene has no fixed document; a nested composition reads its own), `scene.aspect` (width / height, 0 without a document), `scene.dt` (seconds since the previous frame; 1 / fps in renders), `scene.scroll` (0–1, host page scroll), `scene.pixelRatio` and `scene.clock.hour` / `minute` / `second` (real local time with fractional seconds; the players supply them, renders and exports see neutral values so they stay reproducible), the live pointer `scene.mouse.posX`, `posY` (scene coordinates in px), `fracX`, `fracY` (0–1 across the viewBox), `down`, `inside` (0/1), `rightDown`, `middleDown` (0/1), `clicks` (primary clicks so far), `clickMs` (ms since the last, 0 before any), `wheel` (accumulated: 1 per 100 px of deltaY, positive = down), `velX`, `velY` (px/s, smoothed; 0 once it stops) and `downMs` (ms the primary button has been held; after release, the length of the last press, 0 before any; Mouse Instance formulas see all of these at the input event); fed by the players, neutral in headless renders; a nested composition sees the parent's values as they are), and custom document variables such as `scene.custom.density`. Custom variables can be numbers or expressions that reference other custom variables; dependencies are resolved automatically and cycles use the stored fallback values. Variables are scoped to their scene, so nested compositions use their own variables. The safe math language supports `min`, `max`, `clamp`, `lerp`, `sin`, `cos`, `tan`, `abs`, `round`, `floor`, `ceil`, `sqrt`, `pow`, `atan`, `atan2`, `deg` (radians to degrees), `pi`, and `e`, plus `scene.countDown(seconds)`; it does not execute JavaScript. Shaping helpers: `map(x, inMin, inMax, outMin, outMax)` (unclamped), `mod(a, b)` (sign of b: `mod(-1, 3)` is 2, where `%` gives -1), `step(edge, x)` (0 below edge, 1 from it: a gate, since there are no comparisons), `smoothstep(a, b, x)`, `easeIn(t)` / `easeOut(t)` / `easeInOut(t)` (cubic, t clamped to 0–1), `pick(i, a, b, …)` (value at index i from 0, wrapping: `pick(mod(scene.mouse.clicks, 3), 10, 20, 40)` steps through them on each click) and `noise(x, seed?)` (smooth deterministic noise in −1…1, e.g. `40 * noise(scene.time)`; follows the document seed, the optional seed picks another curve). Followers: `smooth(x, seconds?)` eases towards x, reaching about 95% of a jump in `seconds` (0.3 by default); `spring(x, seconds?, bounce?)` follows x like a spring of that period (0.5 s) with bounce 0–1 (0.5; 0 never overshoots). Both remember the previous frame of the engine's frame-by-frame evaluation (players, editor, frame exports rendered in order with one engine), so `smooth(scene.mouse.posX, 0.4)` follows the pointer with lag. Without that memory (a single-frame render, looks at other times for trails or history, Mouse copies, nested compositions) they return x; a step back in time or a jump of more than a second restarts them at x. Text shape content also interpolates expressions inside braces, e.g. `{{scene.time}}` or `{{scene.countDown(10)}}`; use `{{fixed(scene.time, 2)}}` to keep exactly two decimal places, optionally zero-padding the integer part with `{{fixed(scene.time, 2, 2)}}`. A numeric expression replaces keyframes on the same parameter. Render-time measurements are machine-dependent diagnostics and are not available to expressions.

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

---

## 5. The "Elements" System (Pieces of Geometry)

Many advanced procedural effects operate on collections of **individual elements**:
- Text (`shape: "text"`): Each character/glyph is an individual element.
- Cloner (`clone`): Each duplicated copy is an element.
- Mosaic (`mosaic`): Each cut tile is an element.
- Fracture/Wear (`crack` in `"shatter"` mode, `damage`): Each broken shard is an element.
- Groups (`kind: "group"`): Each child node acts as an element.

The **Effector** modifiers (`step`, `stagger`, `range`, `field`, `explosion`, `color`) distribute procedural values across elements:
- `step`: Multiplies child modifier parameters by the element index (0, 1, 2...).
- `range`: Selects a sliding window of elements (e.g. animate a wave sweeping across characters).
- `field`: Attenuates child modifier strength according to where each element is relative to a geometric field (ellipse, plane, box). `contain` picks the test: `center` (default), `full` (entirely inside) or `partial` (touching).
- `explosion`: Propels elements outward from a blast centre with spin, displacement, and scaling.

> [!WARNING]
> Container effectors (`step`, `stagger`, `range`, `field`, `rgbsplit`) hold nested modifiers inside their `children` array. **An effector cannot nest another effector inside its `children`** (e.g. putting `step` inside `stagger` triggers a validation error).

---

## 6. Geometric Primitives (`shapes`)

**Percent sizes.** Rectangle and Ellipse `width`/`height`, and Rectangle `radius` and its four corner radii, accept a percentage written as text, like CSS: `"width": "50%"`. A plain number is still px. Width is a percentage of the document width, height of the document height (1000 px when the scene has no fixed document), and a corner radius of half the shorter side (`"100%"` makes a pill or a circle). Percentages resolve to px before the shape is built, so effects see plain numbers. Two percentage keyframes interpolate as percentages; a px key next to a % key jumps. `validateScene` warns on a percentage where it is not accepted or on text that is not one. In the editor, click a field's unit (`px` / `%`) to switch: the value is converted, so the drawing stays the same.

All shapes share a standard styling block:
- `fill` (`boolean`, default `true`): Enable shape fill.
- `fillColor` (`color`, default `"#d9d9d9"`): `#rrggbb` hex colour.
- `stroke` (`boolean`, default `false`): Enable outline stroke.
- `strokeColor` (`color`, default `"#ededed"`): Stroke `#rrggbb` hex colour.
- `strokeWidth` (`number`, default `2`, px): Stroke line thickness.
- `strokeJoin` (`"miter" | "round" | "bevel"`, default `"round"`): Corner join type.
- `strokeCap` (`"butt" | "round" | "square"`, default `"round"`): Line endings.
- `dash` (`number`, px, default `0`): Dash length (0 = solid line).
- `gap` (`number`, px, default `0`): Gap between dashes.
- `dashOffset` (`number`, px, default `0`): Dash phase shift (animatable for marching dashes).
- `behind` (`boolean`, default `false`): Renders stroke behind fill (`paint-order: stroke`).

### Shape Registry

1. **`rectangle`**
   - `width` (number, default 200, px): Width.
   - `height` (number, default 150, px): Height.
   - `corner` (number, default 0, px): Corner radius.

2. **`ellipse`**
   - `radiusX` (number, default 100, px): Horizontal radius.
   - `radiusY` (number, default 100, px): Vertical radius (identical to `radiusX` makes a circle).

3. **`polygon`**
   - `radius` (number, default 100, px): Outer circumscribed radius.
   - `sides` (number, default 6, min 3, max 64): Number of sides (3 = triangle, 5 = pentagon, 6 = hexagon).

4. **`star`**
   - `radius` (number, default 120, px): Outer tip radius.
   - `innerRadius` (number, default 60, px): Inner valley radius.
   - `points` (number, default 5, min 2, max 64): Number of tips (2 = needle/diamond, 5 = classic star).

5. **`cross`**
   - A filled plus sign, placed immediately after Star in the primitive rail.
   - `size` (number, default 140, px): Overall width and height.
   - `width` (number, default 28, px): Thickness of the arms, clamped to Size. Both fields are animatable. Rotate the object by 45° for an X.

6. **`line`**
   - `length` (number, default 200, px): Segment length.
   - `angle` (angle, default 0, degrees): Line angle. Defaults to stroke only.

7. **`spiral`**
   - `radius` (number, default 100, px): Maximum outer radius.
   - `turns` (number, default 3, min 0.5): Number of Archimedean rotations.
   - `decay` (number, default 0, -1 to 1): Outward expansion rate. Defaults to stroke only.

8. **`text`**
   - Converts strings to precise vector outlines where each glyph is an element.
   - `text` (text, default `"svertik"`): Multi-line string.
   - `fontSize` (number, default 72, px): Font size.
   - `lineHeight` (number, default 1.2): Relative line spacing.
   - `letterSpacing` (number, default 0, px): Tracking / glyph spacing.
   - `align` (`"left" | "center" | "right"`, default `"center"`): Paragraph alignment.
   - `anchor` (`"ink" | "left" | "center" | "right"`, default `"ink"`): Transform anchor point.
   - `font` (font, default `"JetBrains Mono"`): Registered font family name.

9. **`pawn`**
   - svertik test model (a chess pawn with smooth curves and straight steps, analogous to the 3D Utah Teapot).
   - `height` (number, default 200, px): Total height.

---

## 7. Complete Modifier Catalog

### 7.1 Deformers (`kind: "deformer"`)
Move path vertices without altering vector topology.

1. **`transform`**: Moves, rotates, and scales geometry around a custom pivot.
   - `x` (number, def 0, px), `y` (number, def 0, px)
   - `rotation` (angle, def 0, deg)
   - `scale` (number, def 1, min 0)
   - `pivot` (point, def [0.5, 0.5], unit fraction)

2. **`rotate3d`**: 3D rotation (X, Y, Z) projected with perspective onto 2D space.
   - `rotateX` (angle, def 30, deg), `rotateY` (angle, def 0, deg), `rotateZ` (angle, def 0, deg)
   - `perspective` (number, def 2, min 0.5, max 10, fraction)
   - `pivot` (point, def [0.5, 0.5], fraction)

3. **`spherize`**: Bulges (`strength > 0`) or pinches (`strength < 0`) within a circular falloff zone.
   - `center` (point, def [0.5, 0.5], fraction)
   - `radius` (number, def 0.5, fraction)
   - `strength` (number, def 0.5, min -1, max 1)

4. **`twist`**: Whirlpool rotation with intensity proportional to proximity to center.
   - `center` (point, def [0.5, 0.5], fraction)
   - `radius` (number, def 0.6, fraction)
   - `angle` (angle, def 90, deg)

5. **`bend`**: Bends the drawing into a circular sheet-like arc.
   - `angle` (angle, def 90, deg): Positive curves ends downward (∩), negative upward (∪).
   - `axis` (`"horizontal" | "vertical"`, def `"horizontal"`)

6. **`bones`**: Kinematic chain of 2–6 bones between start and end anchors.
   - `segments` (number, def 3, min 2, max 6)
   - `angle1` to `angle6` (angle, def 12, deg)
   - `start` (point, def [0.5, 0.1], fraction), `end` (point, def [0.5, 0.9], fraction)
   - `target` (node, def `""`): Node ID for inverse kinematics (IK) solving.
   - `rigidity` (number, def 0.5, 0 to 1)

7. **`taper`**: Progressively narrows or flares width along an axis.
   - `amount` (number, def 0.5, min -1, max 1)
   - `axis` (`"horizontal" | "vertical"`, def `"horizontal"`)
   - `from` (`"start" | "end" | "center"`, def `"start"`)

8. **`shear`**: Slants geometry along X or Y axes.
   - `amountX` (number, def 0.3, min -2, max 2)
   - `amountY` (number, def 0, min -2, max 2)

9. **`wave`**: Sinusoidal displacement perpendicular to wave propagation angle.
   - `amplitude` (number, def 0.05, fraction)
   - `wavelength` (number, def 0.4, fraction)
   - `phase` (angle, def 0, deg): Animate 0..360 for seamless cycles.
   - `direction` (angle, def 0, deg)

10. **`ripple`**: Concentric circular ripples fading outward from a focal point.
    - `center` (point, def [0.5, 0.5], fraction)
    - `wavelength` (number, def 0.2, fraction)
    - `amplitude` (number, def 0.04, fraction)
    - `phase` (angle, def 0, deg)
    - `decay` (number, def 0.5, 0 to 1)

11. **`noise`**: Continuous simplex/perlin noise displacement.
    - `amount` (number, def 0.05, fraction)
    - `scale` (number, def 4, 0.5 to 20)
    - `evolution` (number, def 0): Temporal shift for breathing animation.
    - `seed` (seed, def 1), `octaves` (number, def 1, 1 to 4)

12. **`roughen`**: Fractal edge tearing and perturbation.
    - `type` (`"organic" | "koch"`, def `"organic"`): `"organic"` tears via midpoint displacement; `"koch"` replaces segments with Koch peaks.
    - `amount` (number, def 0.04, fraction)
    - `iterations` (number, def 2, min 1, max 4)
    - `seed` (seed, def 1)

13. **`roundcorners`**: Rounds sharp path junctions with arcs or chamfers while preserving existing smooth curves.
    - `radius` (number, def 12, max 200, px)
    - `mode` (`"round" | "chamfer"`, def `"round"`)
    - `limit` (angle, def 180, deg): Only corners sharper than this interior angle are rounded.
    - `corners` (`"all" | "random"`, def `"all"`): Random selects a stable subset per clone using `seed`.
    - `seed` (seed, def 1): Controls the per-clone corner selection.

14. **`melt`**: Downward dripping deformation weighted towards bottom coordinates.
    - `amount` (number, def 0.3, fraction)
    - `scale` (number, def 4, 1 to 10)
    - `seed` (seed, def 1)

15. **`cylinder`**: Wraps geometry around a vertical cylinder (e.g. can or bottle label).
    - `wrap` (number, def 0.5, 0.05 to 1, fraction)
    - `radius` (number, def 0.5, fraction)
    - `depth` (number, def 0.5, fraction)
    - `angle` (angle, def 0, deg)

16. **`perspective`**: Free four-corner perspective quadrilateral mapping.
    - `topLeft`, `topRight`, `bottomRight`, `bottomLeft` (point, default corners, fraction)

17. **`envelope`**: 3×3 bicubic mesh patch deformation (`p00` through `p22`).

18. **`pathwrap`**: Bends and flows the drawing along another node's longest path.
    - `target` (node): Target guide node ID.
    - `offset` (number, def 0, fraction)
    - `stretch` (boolean, def true)
    - `align` (`"center" | "left" | "right"`, def `"center"`)

19. **`followpath`**: Rigidly attaches the entire object onto a point of another node's path without bending.
    - `target` (node): Guide path node ID.
    - `position` (number, def 0, fraction 0..1): Progress along path (0 start, 1 end).
    - `anchor` (point, def [0.5, 0.5], fraction)
    - `orient` (boolean, def true): Automatically rotates to face path tangent.
    - `angle` (angle, def 0, deg)
    - `offset` (number, def 0, px): Perpendicular offset.

20. **`lookat`**: Rotates node on its pivot to continuously aim at another node's centroid.
    - `target` (node): Target node ID.
    - `pivot` (point, def [0.5, 0.5], fraction)
    - `facing` (angle, def 0, deg): Forward orientation (0 right, -90 up, 90 down, 180 left).
    - `amount` (number, def 1, 0 to 1)

21. **`morph`**: Smoothly interpolates path vertices, fills, and strokes into another node's geometry.
    - `target` (node): Destination node ID.
    - `progress` (number, def 0.5, 0 to 1)
    - `steps` (number, def 1, 1 to 20): Renders intermediate in-between shapes as distinct elements.

22. **`trim`**: Trims path visible range by length (self-drawing stroke animation).
    - `start` (number, def 0, 0..1)
    - `end` (number, def 1, 0..1): Animate 0 to 1 to draw path dynamically.
    - `offset` (number, def 0, 0..1)

---

### 7.2 Generators (`kind: "generator"`)
Synthesize new geometry, replicate shapes, or slice vectors into elements.

23. **`connect`**: Draws an intelligent dynamic connector line between two target nodes.
    - `from`, `to` (node): IDs of source and target nodes.
    - `fromAnchor`, `toAnchor` (point, def [0.5, 0.5], fraction)
    - `shape` (`"straight" | "arc" | "horizontal" | "vertical"`, def `"straight"`)
    - `bend` (angle, def 20, deg)
    - `gap` (number, def 8, px): Distance buffer from node silhouettes.
    - `arrow` (`"none" | "end" | "start" | "both"`, def `"none"`)
    - `arrowSize` (number, def 10, px)

24. **`trace`**: Generates a trailing motion curve following another node's centroid over past animation time.
    - `target` (node): Target node ID.
    - `length` (number, def 1, seconds): History trail window.
    - `samples` (number, def 24)
    - `mode` (`"smooth" | "polyline"`, def `"smooth"`)

25. **`crack`**: Procedural branching fracture network radiating from an impact point, cut out of the filled shapes.
    - `mode` (`"cut" | "shatter"`, def `"cut"`, not animatable):
      - `"cut"`: Cuts the cracks as gaps of `width` px.
      - `"shatter"`: Cuts them and pushes each loose piece away from the impact `separation` px (each piece becomes an element).
    - `growth` (number, def 1, 0 to 1): Trims the cracks by "time"; animate it to grow them.
    - `cracks` (number, def 5, 1 to 16)
    - `length` (number, def 0.6, fraction of the drawing size)
    - `branching` (number, def 0.35, 0 to 1)
    - `jagged` (number, def 0.4, 0 to 1)
    - `width` (number, def 1, px)
    - `separation` (number, def 6, px): Shatter only.
    - `impact` (point, def [0.4, 0.35], fraction)
    - `seed` (seed, def 1)

26. **`damage`**: Wear and tear with edge notches, perimeter fractures, and hole perforations.
    - `wear` (number, def 0.3, 0 to 1)
    - `growth` (number, def 0.2, 0 to 1)
    - `chips` (number, def 6)
    - `specks` (number, def 12)
    - `seed` (seed, def 1)

27. **`clone`**: Duplicates geometry into multiple copies in a grid, circle, line, or over another node. **Each copy is an element**.
    - `mode` (`"grid" | "radial" | "line" | "object"`, def `"grid"`)
    - `count` (number, def 6)
    - `columns`, `rows` (number, def 3)
    - `spacingX`, `spacingY` (number, def 40, px)
    - `radius` (number, def 120, px)
    - `angleStep` (angle, def 60, deg)
    - `target` (node): Guide node for `"object"` mode.
    - `placement` (`"outline" | "vertices" | "inside"`, def `"outline"`)
    - `seed` (seed, def 1)
    - **Variation** (every mode; fixed random values from `variationSeed`, neutral by default): `jitter` (`[x, y]`, fraction of the *source drawing's* box, so a perfectly horizontal line has no height to jitter or space by), `scaleMin`/`scaleMax` (per-copy scale range, def 1), `rotateJitter` (± degrees), `variationSeed`. Four numbers are drawn per copy in a fixed order, so changing one control does not reshuffle the others. To give copies random colours from a palette, add a Color effect after Clone. A jittered Grid of one bent line under Rope replaces dozens of hand-placed objects.

28. **`mirror`**: Reflects geometry across an axis.
    - `axis` (`"horizontal" | "vertical" | "angle"`, def `"horizontal"`)
    - `position` (number, def 0.5, fraction)
    - `mode` (`"keep" | "transform"`, def `"keep"`): `"keep"` retains original and reflection; `"transform"` keeps reflection only.

29. **`mosaic`**: Slices geometry into geometric tiles across a regular grid. Each tile is an element.
    - `shape` (`"rectangle" | "triangle" | "hexagon" | "target"`, def `"rectangle"`)
    - `columns`, `rows` (number, def 6)
    - `gutter` (number, def 4, px)
    - `angle` (angle, def 0, deg)
    - `mode` (`"cut" | "whole"`, def `"cut"`)

30. **`fractal`**: Iterated Function System (IFS) recursive geometry replication.
    - `type` (`"sierpinski" | "carpet" | "tree" | "spiral"`, def `"sierpinski"`)
    - `depth` (number, def 3, 1 to 6)
    - `ratio` (number, def 0.5)
    - `fit` (boolean, def true)

31. **`halftone`**: Vector halftone screen reproducing tonal luminosity using dot sizes on a rotated grid.
31a. **`dithering`**: Converts tone to a binary grid of vector cells using ordered Bayer thresholds, Floyd–Steinberg or Atkinson error diffusion, or deterministic seeded noise. Contiguous cells merge into larger rectangles; large grids raise Cell size as needed to cap work at 40,000 samples.
    - `shape` (`"circle" | "square" | "diamond" | "line" | "ring"`, def `"circle"`)
    - `spacing` (number, def 16, px)
    - `angle` (angle, def 45, deg)
    - `minSize`, `maxSize` (number, def 1 and 14, px)
    - `gamma` (number, def 1, 0.2 to 3)
    - `color` (`"ink" | "original"`, def `"ink"`)
    - `inkColor` (color, def `"#0d0d10"`)
    - `invert` (boolean, def false)
    - `jitter` (number, def 0, fraction)

31b. **`vectorgrain`**: Vector stipple that gathers at the edges, made of real marks (unlike the SVG `grain` filter). Density is highest at the edge and falls off inward.
    - `edge` (`"inside" | "outside" | "both"`, def `"inside"`)
    - `density` (number, def 2000, 0 to 5000, marks per 100×100 px at the edge), `falloff` (number, def 40, px), `curve` (number, def 1.5), `interior` (number, def 0, 0 to 1: density deep inside, as a fraction of the edge's)
    - `center` (point, def `[0.5, 0.5]`, fraction of the drawing's box; a handle on the canvas) works as a light: in the middle the band of grain is even all round; moved off it, the band gets thinner and sparser on the edge near it and wider and denser on the far edge (up to 3× the falloff). `focus` (number, def 1, 0 to 1; 0 keeps the band even) sets how much, `focusCurve` (number, def 1) sharpens it. With the centre top left, a circle reads as a sphere lit from the top left
    - `distribution` (`"random" | "even"`, def `"random"`)
    - `shape` (`"circle" | "square" | "speck"`, def `"circle"`)
    - `size` (number, def 1.2, px), `sizeJitter` (number, def 0.5), `edgeSize` (number, def 1: size multiplier at the edge)
    - `color` (`"ink" | "original"`, def `"ink"`), `ink` (color, def `"#000000"`), `blend` (CSS blend mode, def `"normal"`)
    - `opacity` (number, def 1), `opacityJitter` (number, def 0)
    - `source` (`"keep" | "replace"`, def `"keep"`: the drawing stays, the grain goes on top), `seed` (seed, def 1)
    - At most 80 000 marks per effect (about 180 bytes of SVG each); marks of the same colour and opacity share one path.

31c. **`crosshatch`**: Pen-drawing shading with parallel lines, as real strokes. Up to four layers of hatching: the first at `angle`, then +90°, +45° and −45°. Each layer draws only where the darkness passes its threshold (evenly spread: with 3 layers at 25%, 50% and 75%), so light areas get one set of lines and the darkest get all of them. Line ends are bisected onto the edges of the drawing. Each run of line is its own element (Step, Trim… act line by line) unless `merge` is on. `fixLines: false` (default; editor: **Fix lines**) moves the hatching with the object and with fragments moved by Crack, Gravity or Transform earlier in the stack. Set `fixLines: true` to anchor its angle, spacing and phase to scene coordinates while the object moves, rotates or scales, including parent-group transforms. Effects after Crosshatch still transform the generated lines normally. For a hand-drawn line, add Roughen after it.
    - `spacing` (number, def 6, 1 to 100, px), `angle` (angle, def 45), `layers` (number, def 3, 1 to 4), `width` (number, def 1, px, line width)
    - `gamma` (number, def 1), `invert` (boolean, def false)
    - `color` (`"ink" | "original"`, def `"ink"`), `ink` (color, def `"#111111"`)
    - `offset` (point, def `[0, 0]`, fraction of the spacing; animate it to slide the lines), `fixLines` (boolean, def false), `merge` (boolean, def false)
    - Canvas controls: the detached circular **Offset** handle slides the screen with reduced sensitivity and without wrapping its displayed position. **Angle** rotates the screen; **Spacing** changes the distance across the guide lines. Shift snaps Angle to 15°, Offset to quarter cells and Spacing to whole pixels. Arrow keys nudge the selected handle.
    - **Merge lines** off keeps every run as an independent element and Gravity body. On joins marks into one path per colour, while all those paths remain one rigid body, including in Original colour mode. This choice applies consistently to both Gravity Solids and the Floor. With Collisions enabled, strokes that start crossed are not forcibly pushed apart at playback start: their initial pair contact is ignored until they separate, then later contacts behave normally. Line width contributes to contacts; merged strokes collide through the convex envelope of their marks, so gaps inside that envelope are solid.
    - Stack order matters: `Polygon → Crosshatch → Gravity` drops individual strokes with Merge off, or the complete hatched drawing with Merge on. `Polygon → Gradient → Crack → Gravity → Crosshatch` moves the fragments first; with Fix lines off their hatching follows the Crack/Gravity/Transform material frame, while on samples a screen fixed to the scene.
    - Editor selection uses the evaluated object bounds as a fallback between strokes, in both normal and Wire views. Moving or deforming the object moves this region; grabbing it does not require hitting an individual thread.
    - Sampling indexes nearby fragments and contour edges, and resolves gradient stops once per prepared input. It does not reduce the line density or colour resolution to improve performance.

32. **`slices`** (Glitch family): Horizontal bands shifted laterally. Each band is an element.
    - `count` (number, def 8), `amount` (number, def 0.15, fraction), `probability` (number, def 0.6, 0 to 1), `seed` (seed, def 1)

33. **`blocks`** (Glitch family): Cut-out rectangular blocks displaced leaving holes.
    - `count` (number, def 6), `size` (number, def 30, px), `amount` (number, def 0.2, fraction), `seed` (seed, def 1)

34. **`scanlines`** (Glitch family): CRT raster lines clipped to the vector shape.
    - `spacing` (number, def 6, px), `thickness` (number, def 2, px), `opacity` (number, def 0.35, 0 to 1)

35. **`streaks`** (Glitch family): Horizontal laser streaks escaping from shape edges.
    - `count` (number, def 12), `length` (number, def 40, px), `direction` (`"left" | "right" | "both"`, def `"right"`), `bite` (boolean, def false)

36. **`rgbsplit`** (Glitch family): Vector chromatic separation. `mode: "channels"` (default) extracts RGB from the source paint: red moves by −Distance along Angle, blue by +Distance, green stays in place. It preserves the source colours rather than painting two flat copies on top.
    - `distance` (number, def 3, 0 to 60, px), `angle` (angle, def 0, clockwise degrees). Distance 0 preserves the input exactly in Channels mode.
    - `background` (`"dark" | "light"`, def `"dark"`): Dark combines RGB with Screen; Light uses complementary CMY plates with Multiply. Choose the setting for the surface behind the drawing. Linear/radial gradients retain all stops, opacity, units and transforms; solid fill/stroke alpha is retained too.
    - `mode: "duo"` restores the previous two-colour-copy look: `colorA` (def `"#00e5ff"`), `colorB` (def `"#ff2bd6"`), `layer` (`"behind" | "front"`, def `"behind"`), `blend` (def `"normal"`), `original` (boolean, def true). These controls only apply to Duo. Set Duo explicitly in scenes authored for the old appearance; an omitted mode now selects Channels.
    - Nested `children` act on the two shifted plates, not the stationary green plate. Each shifted channel has its own filter group, so Blur/Glow do not discard a channel where the plates overlap. In Duo, children act on the two coloured copies, leaving Original unchanged. Geometry stays vector in SVG; nested filters and blending depend on the target renderer/exporter.

37. **`boolean`**: Vector CSG boolean operations between node elements (group children or clone copies).
    - `operation` (`"union" | "subtract" | "intersect" | "exclude"`, def `"union"`)

38. **`metaball`**: Organic fluid fusion (lava lamp drop merging). Computes signed distance fields (SDF) with smooth polynomial union and produces clean vector Bézier outlines.
    - `reach` (number, def 40, px), `grow` (number, def 0, px), `quality` (number, def 100)

39. **`pixelate`**: Vector voxelization into pixel art where cells sample color at their centers.
    - `size` (number, def 8, px), `gap` (number, def 0, px), `shape` (`"square" | "dot"`, def `"square"`), `offset` (point, def [0, 0], px)

---

### 7.3 Effectors (`kind: "effector"`)
Distribute modifier evaluation across elements. All container effectors accept nested modifiers in their `children` array.

40. **`step`**: Incremental multiplier. Multiplies parameters of child modifiers by the element index.
    - *Example:* Placing `twist` with `angle: 10` inside `step` rotates copy #0 by 0°, copy #1 by 10°, copy #2 by 20°, etc.

41. **`stagger`**: Staggered time transition. Elements cascade sequentially from/to their child modifiers.
    - `progress` (number, def 0, 0 to 1): Animate 0 to 1 for complete entrance/exit.
    - `direction` (`"in" | "out"`, def `"in"`)
    - `curve` (`"linear" | "ease-in" | "ease-out" | "ease-in-out" | "back-out"`, def `"ease-out"`)
    - `delay` (number, def 0.3, 0 to 1): Cascading delay offset between successive elements.
    - `jitter` (number, def 0, in positions): pushes each element's turn later by a random amount up to this many positions (seeded by `seed`), so a row keeps its order on the whole but neighbours may swap. The total length leaves room for the largest push, so it does not depend on the draw.

42. **`range`**: Selects elements for its nested effects, independently of the effects themselves.
    - `selector` (`"all" | "even" | "odd" | "nth"`, default `"all"`; editor: **Select**). CSS-style positions are one-based: Even picks 2, 4, 6…; Odd picks 1, 3, 5… . Custom `nth` (text, default `"2n"`; editor: **An+B**) accepts `3n+2`, `-n+3`, a single index such as `4`, or `even`/`odd`. `n` starts at zero; invalid formulas select nothing and validation warns. This is a selector grammar, not JavaScript.
    - `unit` (`"elements" | "words" | "lines" | "rows" | "columns"`, default `"elements"`). Lines means text lines; Rows/Columns means Clone Grid cells. For alternating grid rows: **Unit: Rows → Select: Odd**, then nest Transform with an X offset. Partial grids keep the original row/column numbers; packed tiles use their top-left cell. Non-grid shapes are not selected by Rows/Columns. A subsequent Clone replaces grid coordinates with its own grid; a non-grid Clone clears them.
    - `start` / `end` (default 0 / 1) and `offset` (default 0) limit the selected band. They intersect with Select, rather than changing its parity. `amount` (default 1) scales the selected effects. `random` (default false) shuffles ordering reproducibly using `seed`; with Random order on, parity refers to that shuffled order.
    - `shape` is still the saved JSON key, but the inspector calls it **Falloff**: Square applies a uniform amount; Ramp up/down, Triangle, Round and Smooth vary the amount within the band. It does not select objects or change their geometric shape. Use Square for a constant Transform on alternate rows.
    - Wire highlights only the affected elements of the Range currently selected in the stack. Switching Range switches the highlight; selecting a different effect clears it. Ranges get stable colours from a five-colour palette. This is an editor diagnostic, with no effect on rendering, export or pointer handling.

```json
{
  "id": "odd-rows",
  "type": "range",
  "params": { "unit": "rows", "selector": "odd", "shape": "square" },
  "children": [{ "id": "shift-rows", "type": "transform", "params": { "x": 30 } }]
}
```

43. **`field`**: Geometric falloff selector. Modulates child modifiers based on spatial distance to a field center.
    - `shape` (`"circle" | "linear" | "box"`, def `"circle"`), `center` (point, def [0.5, 0.5], fraction), `width` / `height` (circle and box, def 0.7, fraction of the drawing size; turned by `angle`), `distance` (linear, def 0.35, fraction), `contain` (`"center" | "full" | "partial"`, def `"center"`), `softness` (number, def 0.5, 0..1), `angle` (degrees), `invert` (boolean, def false), `amount` (0..1), `unit` (`"elements" | "words" | "lines"`). From an Effector node, fractions are of the document.

44. **`explosion`**: Detonates elements outward from a blast centre.
    - `amount` (number, def 0, 0 to 1): Main blast progress.
    - `center` (point, def [0.5, 0.5], fraction), `spread` (number, def 120, px), `spin` (angle, def 180, deg), `scale` (number, def 0.5, 0..1), `seed` (seed, def 1)

---

### 7.4 Style Modifiers (`kind: "style"`)

45. **`color`**: Per-element color distribution.
    - `mode` (`"shift" | "gradient" | "random"`, def `"shift"`), `hue` (angle, def 60, deg), `saturation` (number, def 0, -1..1), `lightness` (number, def 0, -1..1), `fromColor`, `toColor` (color, def `"#09fdd1"` and `"#ff2a5f"`), `seed` (seed, def 1)

46. **`tint`**: Blends base colour towards a target tint.
    - `color` (color, def `"#ffffff"`), `amount` (number, def 0.5, 0..1)

47. **`paint`**: Overrides fill and stroke styling for geometry.
    - `fill` (boolean, def true), `fillColor` (color, def `"#09fdd1"`), `fillOpacity` (number, def 1, 0..1)
    - `stroke` (boolean, def true), `strokeColor` (color, def `"#0d0d10"`), `strokeWidth` (number, def 3, px), `strokeOpacity` (number, def 1, 0..1)
    - `dash`, `gap`, `dashOffset`, `behind`: Advanced stroke controls.

48. **`gradient`**: Generates native `<linearGradient>` or `<radialGradient>` on fills or strokes.
    - `target` (`"fill" | "stroke"`, def `"fill"`), `type` (`"linear" | "radial"`, def `"linear"`), `angle` (angle, def 90, deg), `from` (color, def `"#09fdd1"`), `to` (color, def `"#055244"`), `via` (color, def `""`), `center` (point, def [0.5, 0.5], fraction), `radius` (number, def 0.5, fraction)

49. **`feather`**: Softens a filled shape with a native radial gradient; it expands the shape to preserve its opaque centre and avoids a raster SVG filter.
    - `softness` (number, def 0.2, 0..0.6, fraction): Width of the fade at the shape's edge.

50. **`mask`**: Native SVG masking (`<mask id="...">`) driven by another node.
    - `source` (node): Mask node ID.
    - `whole` (boolean, def false): Whole elements (shape mode). Discard elements crossing the boundary rather than clipping them. Clone copies remain indivisible, including compound copies. Uses the filled outline, holes and strokes after the geometry stack; invert keeps only complete elements outside.
    - `mode` (`"shape" | "luminance"`, def `"shape"`), `invert` (boolean, def false)

51. **`opacity`**: Node transparency control.
    - `opacity` (number, def 0.5, 0..1)

---

### 7.5 SVG Filters (`kind: "filter"`)
Processed natively via browser `<filter>` primitives. Executed after geometry evaluation.

52. **`shadow`**: Drop shadow.
    - `x` (number, def 0, px), `y` (number, def 10, px), `blur` (number, def 16, px), `color` (color, def `"#000000"`), `opacity` (number, def 0.4, 0..1)

53. **`blur`**: Gaussian or directional motion blur.
    - `radius` (number, def 8, px), `direction` (`"both" | "horizontal" | "vertical"`, def `"both"`)

54. **`glow`**: Outer radial aura.
    - `radius` (number, def 16, px), `color` (color, def `"#09fdd1"`), `strength` (number, def 1, 0.2..4)

55. **`grain`**: Photochemical analogue film grain confined to painted silhouette.
    - `amount` (number, def 0.25, 0..1), `size` (number, def 1.5, px), `seed` (seed, def 1)

56. **`displace`**: Turbulent edge displacement map.
    - `amount` (number, def 8, px), `scale` (number, def 20, px), `seed` (seed, def 1)

57. **`bevel`**: 3D embossed lighting relief (`<feDiffuseLighting>` + `<feSpecularLighting>`).
    - `depth` (number, def 6, px), `height` (number, def 4, px), `angle` (angle, def 45, deg), `elevation` (angle, def 50, deg), `shine` (number, def 0.6, 0..1), `shininess` (number, def 30, 1..100)

58. **`thicken`**: Morphological dilation or sticker outline (`<feMorphology>`).
    - `mode` (`"grow" | "outline"`, def `"grow"`), `amount` (number, def 4, px), `color` (color, def `"#ffffff"`)

59. **`tone`**: Color map manipulation (`<feComponentTransfer>`).
    - `mode` (`"posterize" | "duotone" | "invert"`, def `"posterize"`), `levels` (number, def 4, 2..16), `shadows` (color, def `"#05051a"`), `lights` (color, def `"#09fdd1"`)

### 7.6 Motion, physics and texture
Effectors and generators added after the first catalog: oscillators, physics, particles and grain. The full parameter reference for every modifier is generated from the engine schema in `packages/engine/docs/reference/`.

60. **`spikes`** (deformer): Regular spikes along the outline: `count` tips per path, evenly spaced, `height` px out (negative: inwards).
    - `count` (number, def 12, 1..200), `height` (number, def 30, -500..500, px), `curve` (number, def 0, -1..1), `width` (number, def 1, 0.05..1, fraction)
    - `lean` (number, def 0, -1..1), `phase` (number, def 0, 0..1, fraction)

61. **`gather`** (deformer): Squeezes the drawing towards one side along an axis, by an amount that changes across it: Start applies at one edge (top for axis x, left for axis y), End at the other, positive towards the left/top and negative towards the right/bottom.
    - `axis` (`"x" | "y"`, def "x"), `start` (number, def 0.5, -0.99..0.99), `end` (number, def -0.5, -0.99..0.99)

62. **`vectorgrain`** (generator): Vector stipple that gathers at the edges, as real marks (not the SVG Grain filter).
    - `edge` (`"inside" | "outside" | "both"`, def "inside"), `density` (number, def 2000, 0..5000), `falloff` (number, def 40, 0.5..2000, px), `curve` (number, def 1.5, 0.1..6)
    - `interior` (number, def 0, 0..1), `center` (point, def [0.5, 0.5], fraction), `focus` (number, def 1, 0..1), `focusCurve` (number, def 1, 0.1..6)
    - `distribution` (`"random" | "even"`, def "random"), `shape` (`"circle" | "square" | "speck"`, def "circle"), `size` (number, def 1.2, 0.05..50, px), `sizeJitter` (number, def 0.5, 0..1)
    - `edgeSize` (number, def 1, 0.1..4), `color` (`"ink" | "original"`, def "ink"), `ink` (color, def "#000000"), `blend` (`"normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "color-dodge" | "color-burn" | "hard-light" | "soft-light" | "difference" | "exclusion" | "hue" | "saturation" | "color" | "luminosity"`, def "normal")
    - `opacity` (number, def 1, 0..1), `opacityJitter` (number, def 0, 0..1), `source` (`"keep" | "replace"`, def "keep"), `seed` (seed, def 1)

63. **`particles`** (generator): Seeded particle generator that uses the complete source object as its particle: geometry, colours and relative proportions are preserved.
    - `time` (number, def 1, 0..60), `emission` (`"burst" | "stream"`, def "burst"), `count` (number, def 64, 1..512), `lifetime` (number, def 3, 0.05..30)
    - `seed` (seed, def 1), `center` (point, def [0.5, 0.5], fraction), `emitter` (`"point" | "line" | "box" | "circle"`, def "circle"), `area` (point, def [0.15, 0.15], fraction)
    - `motion` (`"free" | "impulse"`, def "free"), `direction` (angle, def -90), `spread` (number, def 90, 0..360), `speed` (number, def 0.8, 0..5, fraction)
    - `speedRandom` (number, def 0.5, 0..1), `spin` (angle, def 180), `gravity` (number, def 0.6, 0..5, fraction), `size` (number, def 0.05, 0.001..1, fraction)
    - `sizeRandom` (number, def 0.6, 0..1), `rotationRandom` (angle, def 360), `fade` (number, def 0.2, 0..1), `keepSource` (boolean, def false)

64. **`gravity`** (effector): Drops each element as a rigid body onto a virtual floor, inheriting velocity and spin from Explosion or Rigid body. Floor rotation is measured from the scene horizon. Crosshatch Merge controls one-body versus per-line dynamics consistently on the floor and solids; see the Gravity section below.
    - `time` (number, def 1, 0..60), `gravity` (number, def 1, 0..10, fraction), `floor` (point, def [0.5, 1.5], fraction), `rotation` (angle, def 0)
    - `collisions` (boolean, def false), `solids` (nodes, def []), `physics` (boolean, def true), `friction` (number, def 0.7, 0..1)
    - `bounce` (number, def 0.15, 0..1)

65. **`physics`** (effector): A deterministic 2D rigid-body simulation for a group.
    - `time` (number, def 0, 0..60), `acceleration` (point, def [0, 0], px), `collisions` (boolean, def true), `solids` (nodes, def [])
    - `friction` (number, def 0, 0..1), `bounce` (number, def 1, 0..1)

66. **`rigidbody`** (deformer): Initial linear velocity and spin for a child inside a Physics group (or Gravity).
    - `velocity` (point, def [0, 0], px), `spin` (number, def 0, °/s), `immovable` (boolean, def false)

67. **`rope`** (deformer): Open paths hang as ropes pinned at both ends: a Verlet chain with the drawn length, Gravity, Wind and Damping, that settles and swings.
    - `time` (number, def 0, 0..100000), `gravity` (number, def 1, 0..10, fraction), `wind` (number, def 0, 0..5), `damping` (number, def 0.8, 0..20)
    - `stiffness` (number, def 14, 1..60), `segments` (number, def 24, 4..120), `pointer` (point, def [-2, -2], fraction), `space` (`"box" | "scene"`, def "box")
    - `radius` (number, def 0, 0..1, fraction), `settle` (number, def 0, 0..10, s), `seed` (seed, def 1)

68. **`oscillate`** (effector): Periodic modulation of nested effects: sine, triangle, square or saw.
    - `wave` (`"sine" | "triangle" | "square" | "saw"`, def "sine"), `time` (number, def 0, s), `frequency` (number, def 1, 0..20, Hz), `amplitude` (number, def 1, 0..2)
    - `offset` (number, def 0, -2..2), `phase` (angle, def 0), `perElement` (boolean, def true), `elementPhase` (angle, def 20)

69. **`wiggle`** (effector): Smooth seeded random modulation of nested effects.
    - `time` (number, def 0, s), `frequency` (number, def 1, 0..20, Hz), `amplitude` (number, def 1, 0..2), `offset` (number, def 0, -2..2)
    - `phase` (angle, def 0), `perElement` (boolean, def true), `elementPhase` (angle, def 20), `seed` (seed, def 1)

70. **`pulse`** (effector): Repeated pulses of nested effects, from neutral to full strength and back.
    - `time` (number, def 0, s), `frequency` (number, def 1, 0..20, Hz), `amplitude` (number, def 1, 0..2), `offset` (number, def 0, -2..2)
    - `phase` (angle, def 0), `perElement` (boolean, def true), `elementPhase` (angle, def 20), `attack` (number, def 0.1, 0..1, fraction)
    - `decay` (number, def 0.4, 0..1, fraction)

71. **`shake`** (effector): A seeded one-shot impact that loses strength and returns exactly to neutral at Duration.
    - `time` (number, def 0, s), `start` (number, def 0, s), `duration` (number, def 1, 0.01..10, s), `frequency` (number, def 8, 0..20, Hz)
    - `amplitude` (number, def 1, 0..2), `decay` (number, def 2, 0.1..8), `perElement` (boolean, def false), `elementDelay` (number, def 0.04, 0..1, s)
    - `seed` (seed, def 1)

---

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

- `time`: elapsed seconds, default `1`, clamped to `0–60`. Animate from `0`, or set `{ "$expr": "scene.time", "fallback": 0 }` to follow playback.
- `gravity`: downward acceleration in source bounding-box sizes per second squared, default `1`.
- `floor`: floor position as fractions of an upright source reference box, default `[0.5, 1.5]`. The reference follows placement and scale while its axes stay aligned to the scene horizon.
- `rotation`: floor angle in clockwise degrees **from the scene horizon**, default `0` (horizontal). It does not inherit object or parent rotation. Gravity acts downwards in scene axes; the positive normal side of the floor is solid. The canvas guide and its position/rotation handles use the same reference as the simulation.

- `physics`: rigid-body dynamics, enabled by default. Disable for the original translation-only, frictionless mode.
- `friction`: contact friction, `0–1`, default `0.7`. Controls sliding and rolling at the floor.
- `bounce`: restitution, `0–1`, default `0.15`. Small resting impacts are damped to let bodies settle.

All numeric parameters and floor position support animation. Rigid bodies use uniform-area centres of mass and rotational inertia: off-centre contacts generate rotation, so unstable pieces tip onto a supporting face. Shapes sharing a clone tag move as one body, preserving paint order. Curves are sampled for mass/contact dynamics; exact cubic support prevents penetration of the rendered floor. Open paths use approximate mass properties. Crosshatch outputs explicit line bodies: their stroke width contributes to floor support and Solid contacts. With **Merge lines** off each line can rotate and settle independently on either surface. With Merge on, all colour paths stay together as one body and use the convex envelope of the marks for Solid contacts. When Collisions is enabled, the initial crossings in an unmerged screen do not create separation impulses: each initially overlapping pair becomes collidable after it separates. This state is included in deterministic seek/replay checkpoints. Other ordinary open paths still use floor-only dynamics; their stroke thickness is not included.

Physics integrates fixed 120 Hz steps, with a fractional final step. Mass properties are cached per input geometry; quarter-second checkpoints and the last full step are reused, so advancing time does not replay the entire fall. Geometry or physics parameter changes invalidate those states. Seeking backwards and headless rendering are deterministic. The current gravity, floor, friction and bounce values are held constant during that replay: their earlier animated values are not integrated. Collisions between pieces are optional (`collisions: true`). The floor guide remains editor-only.

### Soft Body material (`softbody`)

**Effect → Soft Body**, beside Rigid body, defines a material. It does not move or deform the drawing by itself and has no Time, Gravity, Floor, Solids, friction or restitution controls. A following **Gravity**, or **Physics on an ancestor group**, owns the clock, forces and contacts. Each effect has one responsibility.

- `mode`: `"auto"` (default) applies elasticity to both open fibres and closed bodies; `"fibers"` or `"bodies"` limits the material to that path type. Other path types keep rigid dynamics.
- `stiffness`: 0–1, default `0.8`. The defaults aim at firm rubber: limited deformation on impact and quick recovery. Lower values soften the material.
- `bending`: 0–1, default `0.15`, resistance to bending, especially for fibres.
- `volume`: 0–1, default `0.9`; **Keep area** for closed contours, including holes.
- `damping`: 0–1, default `0.4`. Damps internal deformation relative to the body's translation and rigid spin. It is not air drag and does not slow the fall of the whole body.
- `pins`: `"free"` (default), `"start"` or `"ends"`, for fibre attachment. Rigid body's Immovable still pins a complete body; its velocity and spin provide initial motion.
- `segments`: 4–64, default `24`; **Resolution**, approximate material samples per contour. Physics uses a coarse material cage based on contour length, retains authored vertices, and adapts subdivision for dense inputs. Rest-pose cubics, paint and gradients remain intact.

For selected copies, use **Clone → Range (Transform + Soft Body) → Gravity**. Putting Range/Soft Body after Gravity assigns a material after the simulation has already run; it cannot affect that earlier motion. Validation warns about this order. In a Physics group, put Soft Body on the child; keep Time, Acceleration, Solids, Friction and Restitution on the group's Physics effect. Gravity's Physics toggle must remain enabled to simulate elastic material.

The internal deformable solver uses fixed 120 Hz steps and cached checkpoints, using the Gravity/Physics Time up to 60 seconds. Forces, material values and targets are held at their current values throughout replay, as with the rigid simulation. It handles the floor, filled static solids and optional body contacts; no self-collision is applied within one material body. Contacts are sampled, rather than exact analytic curve intersections. Keep input topology stable during a simulation: changing cuts or tessellation rebuilds the material cage and replays that input from rest. Use fewer samples for complex imported paths. Run `node scripts/bench-softbody.mjs` for a CPU-only benchmark of nine crosses, four with the material; the sample scene is `apps/editor/public/demos/softbody-material.svrtk`. Merge on Crosshatch keeps its marks in one elastic structure; off leaves separate fibres. Merely assigning Soft Body does not turn on a simulation or Wire's body diagnostics.

### Physics (`physics`)

A general rigid-body simulation for the children of a group. Add **Physics** to the group, then add **Rigid body** to any child whose initial velocity, spin or fixed state you want to set. Children without a Rigid body start at rest and can still be pushed by collisions. Make a child **Immovable** to use it as a fixed collider; other bodies collide with it but cannot move it. The whole group shares one simulation and time.

- `time`: simulation time in seconds; the editor links it to `scene.time` when added.
- `acceleration`: constant `[x, y]` acceleration in px/s²; `[0, 0]` gives free, frictionless motion between impacts.
- `collisions`: whether dynamic children collide with each other (on by default). Immovable children and `solids` collide regardless.
- `solids`: optional fixed scene objects that act as colliders, including filled paths with holes.
- `friction`: contact friction, `0–1`, default `0`.
- `bounce`: restitution, `0–1`, default `1` for elastic impacts.

Rigid Body's `velocity` is the child’s initial `[x, y]` velocity in px/s; `spin` is its initial angular velocity in degrees/s. Filled contours, including interior holes, are used for collisions; open paths and stroke thickness are ignored. The simulation uses deterministic 120 Hz steps and is seekable and exportable. For a circular arena, use a hollow filled shape as an immovable child or select it under `solids`.

**When the pieces change.** If what enters Physics changes over time (a Mosaic on a child whose rows are animated, an Explosion that starts, children that appear), the simulation does not start over with the new pieces. Physics reads its own input in the past (the engine evaluates the scene at earlier times with the stack cut right before Physics, on a quarter-second grid refined to the exact 120 Hz step of each change) and simulates stretch by stretch: at each change, every new piece starts where the earlier body it comes from was (the one of the same object that overlaps it most at rest), with its angle, its spin and the speed of that point of the body. A piece with no origin starts at rest where it is, with its own Rigid body impulse. The result is the same playing, jumping or exporting; the first jump far into a long simulation costs one evaluation of the scene per sample. A re-cut that crosses earlier cuts (Mosaic recuts the whole source, not its pieces) gives each new piece the motion of the earlier piece it overlaps most. Changes in shape that keep the same pieces don't start a stretch. Effects that read their past declare `history: true` and receive `ctx.history`.


### Rope (`rope`)

Every **open** path becomes a hanging rope pinned at its first and last point (closed paths are left alone): a Verlet chain whose links keep the length of the drawn path, so a path that already is a catenary stays at rest and a slack one drops and swings. Output is smooth cubics through the chain.

- `time`: seconds; bind it to `{ "$expr": "scene.time", "fallback": 0 }`.
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

Contacts use the targets' evaluated filled paths in the Gravity object's local coordinates, including translation, rotation, scale and groups. Only each connected shape's exterior is used: holes and letter counters are filled, so an O behaves as a solid disc. (Physics keeps interior contours, so there a hollow shape can contain moving bodies.) Exteriors are triangulated and merged into convex parts. Disconnected letters/parts remain separate, with open gaps between them. Concave outlines are retained. Collision outlines are simplified at roughly 0.6% of the source size (minimum 0.25 local units); rendered paths stay unchanged. Open paths and stroke thickness do not form solid obstacles. Friction and Bounce govern both the floor and object contacts; mass is proportional to filled area.

Targets are fixed during a replay, using the geometry and placement of the current frame. Animated target changes invalidate cached world states; their historical movement is not integrated and they do not receive forces from the falling pieces. Large initial overlaps may produce abrupt separation. Very fast movement through thin objects can require a thicker collider. A spatial index rejects distant target parts before SAT tests; static geometry, mass properties, simulation checkpoints and completed steps are reused.

Use `node scripts/bench-gravity.mjs --solids` to measure BOOM as a solid, or add `--collisions` to include fragment contacts. CPU timings exclude browser updates/painting. The first jump into an uncached time still costs more than continuing playback.

### Particles (`particles`)

A seeded generator, available in **Generate → Particles**, that duplicates the complete source object as particles. The source itself determines their geometry, colours and proportions; there is no particle-shape selector or object target. The source's bounding box supplies a stable reference for the emitter, sizes and velocities. Use **Color** after Particles for per-particle colour variation, or nest Color in Step for incremental hue changes; Particles itself preserves the source styling. When added in the editor, Time follows `scene.time` automatically; use the compact playback controls or scrub the scene. The emitter position, area and direction can also be dragged on the canvas.

- **Emission**: `burst` creates Count particles at time zero; `stream` emits Count particles per Lifetime seconds, keeping at most Count alive. Each birth has a stable id and seeded random values, so seeking needs no simulation history.
- **Source**: apply Particles directly to the circle, rectangle, star, text, SVG or group you want to emit. All its evaluated paths form one complete particle, preserving their colours and relative positions.
- **Time / Lifetime**: seconds. Time is clamped to 0–60; particles disappear at the end of their lifetime. The default lifetime is 3 seconds.
- **Emitter**: `point`, `line`, `box`, or `circle`. Position is a normalized source-box point; Area is width/height in source-box fractions. The circular emitter samples uniformly inside an ellipse.
- **Motion**: Direction and Spread define a cone in clockwise degrees (−90 points up). Speed is source sizes per second, Gravity is source sizes per second squared. Speed variation and Size variation range from 0 to 1. Spin supplies a seeded angular velocity up to the given degrees/s in either direction; Rotation variation controls the initial orientation.
- **Appearance**: Size is the longest particle dimension as a source-size fraction. Particles preserve their source's colours. Fade out is the final fraction of life over which opacity falls to zero. Keep source retains the emitter drawing as well; subsequent effects apply to that drawing too.

For bursts, `motion: "impulse"` leaves particles at their birth positions and passes velocity/spin to a following rigid-body Gravity. Animate Gravity's Time using the same clock as Particles. In this mode Gravity controls acceleration, floor contacts, collisions and solids; Particles' own Gravity is ignored. Stream emission always uses free analytical motion, because births have different ages; it does not replay a shared collision world with historical births.

Count is capped at 512 live particles and reduced for complex source objects to a budget of roughly 100,000 segments per frame. Multiple paths of one particle share a clone tag, so following effectors operate on the whole particle. The source bounds are computed once per evaluation, and stream evaluation visits only live births rather than all past particles.

Example: `apps/editor/public/demos/particles.json` contains a circle stream and a two-colour rectangle stream on a 1280×900 canvas.


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

Both are effector containers: nest Transform, Color, Opacity or another non-effector inside `children`. Numeric child parameters vary from their neutral values to the configured amplitudes: Transform `y: 30` means ±30 px, `rotation: 15` means ±15°, and `scale: 1.2` means 0.8–1.2 at full bipolar strength. Color in shift mode modulates hue, saturation and lightness. Non-numeric choices (including solid color) do not interpolate. Child parameters marked `ramp: false` remain fixed.

- `time` (seconds, default 0 in the engine) is set to `{ "$expr": "scene.time", "fallback": 1 }` when added in the editor, as for Particles and Gravity. Replace it with a number to freeze, or an expression such as `scene.time * 0.5` to use a slower local clock.
- `frequency` (Hz, default 1, slider 0–20), `amplitude` (default 1, slider 0–2), `offset` (default 0, slider −2–2), `phase` (degrees, default 0). The signal is `offset + amplitude × waveform`.
- `perElement` (default true) gives each clone/glyph its own pivot and signal. `elementPhase` (degrees per element, default 20) adds phase progressively. Disable Per element to apply to the entire drawing with one pivot.
- **Oscillate** (`oscillate`): `wave` is `sine` (default), `triangle`, `square` or `saw`; each has a bipolar range −1 to 1.
- **Wiggle** (`wiggle`): smooth bounded seeded noise, with `seed` (default 1). In Per element mode each element has an independent signal. Seeking, reverse playback and export are deterministic, without simulation history. Frequency zero freezes the signal at its phase.

In the editor both start with a Transform child so they work immediately. The shared demo **Motion: oscillating and wiggling crosses** combines independent rotation/drift with a phased wave of position, scale and hue, without keyframes. Its editable file is `apps/editor/public/demos/motion-crosses.json`.

### Pulse and Shake — rhythm and impacts

Like Oscillate and Wiggle, these are effector containers with non-effector children. The editor adds a Transform child and a `time: { "$expr": "scene.time", "fallback": 1 }` clock. Numeric child values set motion amplitudes relative to their neutral values. Both support deterministic seeking and export, including reverse local clocks.

- **Pulse** (`pulse`) uses the shared Time, Frequency, Amplitude, Offset, Phase, Per element and Element phase controls. Its signal is unipolar (0–1) before amplitude and offset. `attack` (default 0.1) and `decay` (default 0.4) are fractions of a cycle, with smooth transitions and rest for the remainder. If their sum exceeds 1, both are proportionally shortened to fit one period. Zero attack gives an immediate hit; zero decay returns immediately after the peak. Both zero produce rest. Frequency zero freezes at the specified phase. Default child: Transform scale 1.2.
- **Shake** (`shake`) is a single decaying seeded disturbance. `start` (default 0 seconds), `duration` (default 1 second), `frequency` (default 8 Hz), `amplitude` (default 1), `decay` (default 2; higher settles faster), `seed` (default 1). It is exactly neutral before Start and at/after Start + Duration. `perElement` defaults false so the object moves as one body; enabling it gives independent signals, local pivots and an `elementDelay` (default 0.04 seconds per element). Default child: Transform x 12, y 8, rotation 3°. Shake does not repeat by itself; loop/remap its Time expression to repeat hits.

The shared **Rhythm** demo (`apps/editor/public/demos/rhythm-crosses.json`) pulses five crosses and sends one delayed impact through them at 2 seconds, without keyframes.

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

**Compositions: BOOM at two speeds** (`apps/editor/public/demos/compositions-boom.json`) places two copies of the BOOM demo side by side at normal and 60% speed.

### Time Remap, clock signals, stop motion and markers

Composition numeric clock fields support tracks with `on: "composition"`: `time`, `start`, `speed`, `offset`, and `frameRate`. Use **Animate time** in the inspector to replace the default scene.time expression with a numeric key at the playhead. Editing Time then auto-keys an existing track; equal values or hold easing freeze a frame, descending values rewind. **Follow scene time** restores the expression and removes the Time track. Expressions have the usual priority over keyframes on the same field.

`composition.modulation` optionally stores `{ type: "oscillate" | "wiggle" | "pulse" | "shake", params, enabled? }`. **Clock signal** selects it in the inspector. These share the exact signal schemas with their geometric effects; amplitude and offset are seconds added to the primary remapped clock before wrapping/reversal/quantization. Signal Time follows the parent clock unless overridden. A single composition has one signal; Per element controls do not apply to its clock.

**Playback FPS** (`frameRate`, default 0 = free) quantizes the resulting local time downward to intervals of 1/FPS. This can run an 8- or 12-FPS composition in a 30-FPS parent; child expressions, particles and physics all use the same sampled instant. The exact final frame is retained when playback is held at the child's duration.

`animation.markers` is an optional array of `{ id, name, t }` in scene-local seconds. Add markers at the playhead with the timeline flag button, rename/change time/remove them in the Markers list, and click their ruler flags to seek. The compact playback controls offer **Markers** jumps even with the timeline closed. A composition's **From marker** picker copies a child marker's time into Offset. Markers are scoped to each scene and preserved in projects, navigation and undo; shortening the timeline clamps them to its duration.

**Time Remap: freeze and rewind BOOM** (`apps/editor/public/demos/time-remap-boom.json`) demonstrates keyed clocks, a hold, reverse playback, a clock signal and 8-FPS stop motion across three staggered copies.

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
