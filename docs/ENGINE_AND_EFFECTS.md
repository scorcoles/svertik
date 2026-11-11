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
│                   Scene (SceneV2)                      │
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
import { builtins, createEngine, validateScene, type SceneV2 } from '@svertik/engine';
import { writeFileSync } from 'node:fs';

const scene: SceneV2 = {
  version: 2,
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

## 3. Scene Specification (`SceneV2`)

A scene is a plain JSON structure typed as `SceneV2`:

```ts
interface SceneV2 {
  version: 2;                         // Required: must be 2
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
| `shape` | `shape: string`, `params: Record<string, unknown>` | Parametric vector primitive (`rectangle`, `ellipse`, `polygon`, `star`, `line`, `spiral`, `text`, `pawn`). |
| `object` | `source: string` | Raw SVG string imported directly (`<svg viewBox="...">...</svg>`). |
| `group` | `children: SceneNode[]` | Container for child nodes. The group's `stack` acts upon all children as individual elements. |
| `instance` | `of: string` | Dynamic live copy of another node (`of` specifies the target node `id`). Inherits source effects while adding its own independent transform and stacked modifiers. |
| `effector` | `targets: string[]`, `delay?: number` | Invisible utility node. Injects its own `stack` into each target node separately. `delay` (seconds) staggers the animation timing per target. |

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
- `field`: Attenuates child modifier strength according to physical spatial proximity to a geometric field (circle, plane, box).
- `explosion`: Propels elements outward from a blast centre with spin, displacement, and scaling.

> [!WARNING]
> Container effectors (`step`, `stagger`, `range`, `field`, `rgbsplit`) hold nested modifiers inside their `children` array. **An effector cannot nest another effector inside its `children`** (e.g. putting `step` inside `stagger` triggers a validation error).

---

## 6. Geometric Primitives (`shapes`)

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

5. **`line`**
   - `length` (number, default 200, px): Segment length.
   - `angle` (angle, default 0, degrees): Line angle. Defaults to stroke only.

6. **`spiral`**
   - `radius` (number, default 100, px): Maximum outer radius.
   - `turns` (number, default 3, min 0.5): Number of Archimedean rotations.
   - `decay` (number, default 0, -1 to 1): Outward expansion rate. Defaults to stroke only.

7. **`text`**
   - Converts strings to precise vector outlines where each glyph is an element.
   - `text` (text, default `"svertik"`): Multi-line string.
   - `fontSize` (number, default 72, px): Font size.
   - `lineHeight` (number, default 1.2): Relative line spacing.
   - `letterSpacing` (number, default 0, px): Tracking / glyph spacing.
   - `align` (`"left" | "center" | "right"`, default `"center"`): Paragraph alignment.
   - `anchor` (`"ink" | "left" | "center" | "right"`, default `"ink"`): Transform anchor point.
   - `font` (font, default `"JetBrains Mono"`): Registered font family name.

8. **`pawn`**
   - svertik test model (a chess pawn with smooth curves and straight steps, analogous to the 3D Utah Teapot).
   - `height` (number, default 200, px): Total height.

---

## 7. Complete Catalog of All 58 Modifiers

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

25. **`crack`**: Procedural branching fracture network radiating from an impact point.
    - `center` (point, def [0.5, 0.5], fraction)
    - `branches` (number, def 5, 2 to 16)
    - `segments` (number, def 4, 1 to 10)
    - `width` (number, def 2, px)
    - `mode` (`"lines" | "cut" | "shatter"`, def `"lines"`):
      - `"lines"`: Draws crack lines over geometry.
      - `"cut"`: Slices gaps into shape.
      - `"shatter"`: Cuts shards and drives them outward (each shard becomes an element).
    - `spread` (number, def 20, px)
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
    - `shape` (`"circle" | "square" | "diamond" | "line" | "ring"`, def `"circle"`)
    - `spacing` (number, def 16, px)
    - `angle` (angle, def 45, deg)
    - `minSize`, `maxSize` (number, def 1 and 14, px)
    - `gamma` (number, def 1, 0.2 to 3)
    - `color` (`"ink" | "original"`, def `"ink"`)
    - `inkColor` (color, def `"#0d0d10"`)
    - `invert` (boolean, def false)
    - `jitter` (number, def 0, fraction)

32. **`slices`** (Glitch family): Horizontal bands shifted laterally. Each band is an element.
    - `count` (number, def 8), `amount` (number, def 0.15, fraction), `probability` (number, def 0.6, 0 to 1), `seed` (seed, def 1)

33. **`blocks`** (Glitch family): Cut-out rectangular blocks displaced leaving holes.
    - `count` (number, def 6), `size` (number, def 30, px), `amount` (number, def 0.2, fraction), `seed` (seed, def 1)

34. **`scanlines`** (Glitch family): CRT raster lines clipped to the vector shape.
    - `spacing` (number, def 6, px), `thickness` (number, def 2, px), `opacity` (number, def 0.35, 0 to 1)

35. **`streaks`** (Glitch family): Horizontal laser streaks escaping from shape edges.
    - `count` (number, def 12), `length` (number, def 40, px), `direction` (`"left" | "right" | "both"`, def `"right"`), `bite` (boolean, def false)

36. **`rgbsplit`** (Glitch family): Geometric chromatic aberration (cyan/magenta or red/blue offset copies). Exports cleanly to vector SVG or Lottie. Accepts nested modifiers inside `children` that apply solely to colored clones.
    - `distance` (number, def 10, px), `angle` (angle, def 0, deg)

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

42. **`range`**: Cardinal order selector. Modulates child modifiers based on element index in sequence.
    - `start` (number, def 0, 0..1), `end` (number, def 1, 0..1), `offset` (number, def 0, -1..1), `smoothness` (number, def 0.2, 0..1)

43. **`field`**: Geometric falloff selector. Modulates child modifiers based on spatial distance to a field center.
    - `shape` (`"circle" | "plane" | "box"`, def `"circle"`), `center` (point, def [0.5, 0.5], fraction), `size` (number, def 0.4, fraction), `softness` (number, def 0.3, 0..1), `invert` (boolean, def false)

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

49. **`mask`**: Native SVG masking (`<mask id="...">`) driven by another node.
    - `source` (node): Mask node ID.
    - `mode` (`"shape" | "luminance"`, def `"shape"`), `invert` (boolean, def false)

50. **`opacity`**: Node transparency control.
    - `opacity` (number, def 0.5, 0..1)

---

### 7.5 SVG Filters (`kind: "filter"`)
Processed natively via browser `<filter>` primitives. Executed after geometry evaluation.

51. **`shadow`**: Drop shadow.
    - `x` (number, def 0, px), `y` (number, def 10, px), `blur` (number, def 16, px), `color` (color, def `"#000000"`), `opacity` (number, def 0.4, 0..1)

52. **`blur`**: Gaussian or directional motion blur.
    - `radius` (number, def 8, px), `direction` (`"both" | "horizontal" | "vertical"`, def `"both"`)

53. **`glow`**: Outer radial aura.
    - `radius` (number, def 16, px), `color` (color, def `"#09fdd1"`), `strength` (number, def 1, 0.2..4)

54. **`grain`**: Photochemical analogue film grain confined to painted silhouette.
    - `amount` (number, def 0.25, 0..1), `size` (number, def 1.5, px), `seed` (seed, def 1)

55. **`displace`**: Turbulent edge displacement map.
    - `amount` (number, def 8, px), `scale` (number, def 20, px), `seed` (seed, def 1)

56. **`bevel`**: 3D embossed lighting relief (`<feDiffuseLighting>` + `<feSpecularLighting>`).
    - `depth` (number, def 6, px), `height` (number, def 4, px), `angle` (angle, def 45, deg), `elevation` (angle, def 50, deg), `shine` (number, def 0.6, 0..1), `shininess` (number, def 30, 1..100)

57. **`thicken`**: Morphological dilation or sticker outline (`<feMorphology>`).
    - `mode` (`"grow" | "outline"`, def `"grow"`), `amount` (number, def 4, px), `color` (color, def `"#ffffff"`)

58. **`tone`**: Color map manipulation (`<feComponentTransfer>`).
    - `mode` (`"posterize" | "duotone" | "invert"`, def `"posterize"`), `levels` (number, def 4, 2..16), `shadows` (color, def `"#05051a"`), `lights` (color, def `"#09fdd1"`)

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
