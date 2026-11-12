# @svertik/engine — guide for agents

Non-destructive SVG effects and motion. A **scene** (plain JSON) describes objects, a stack of effects on
each one, an optional animation and optional interactions. The engine evaluates it to SVG paths. Nothing is
baked: change a parameter and the result is recomputed.

- Reference of every effect and primitive (parameters, defaults, ranges, JSON snippets): [`docs/reference/index.md`](docs/reference/index.md).
- Overview and concepts: [`docs/index.md`](docs/index.md).
- Always run `validateScene(scene)` on a scene you wrote: it lists errors and silent mistakes (unknown params, ids that point nowhere).

## Minimal use

```ts
import { builtins, createEngine, validateScene, type SceneV2 } from '@svertik/engine';

const scene: SceneV2 = {
  version: 2,
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

## The scene (`SceneV2`)

```ts
{
  version: 2,
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
| `shape` | `shape`, `params` | A primitive (rectangle, ellipse, polygon, star, line, spiral, text, pawn). See `docs/reference/shapes/`. |
| `object` | `source` | An imported SVG (its markup as a string). |
| `group` | `children` | Children drawn together; the group's stack applies to all of them at once (each child is an element). |
| `instance` | `of` | A live copy of another node's result (with its effects), with its own transform and effects on top. |
| `effector` | `targets`, `delay?` | Draws nothing: its stack is appended to each target's stack, separately. `delay` (s) staggers its animation per target. |

### Effects (`stack` items)

```ts
{ id: 'bend-1', type: 'bend', params: { angle: 45 }, enabled?: true, children?: [...] }
```

- `type` is one of the built-ins (see the reference). Missing `params` take their defaults.
- `children`: only in Step, Stagger, Range, Field (effectors: they apply their children per element) and RGB Split.
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

- **Coordinates**: y grows downwards. A node is centred on its `transform.x/y` (the centre of its own
  drawing). Rotations in degrees, clockwise.
- **Fractions**: `point` params with unit `fraction` (centres, pivots, anchors) and `fraction` numbers
  (radii) are relative to the box the effect measures: the object's drawing, or what an earlier Clone,
  Mirror… produced. `[0.5, 0.5]` is the centre.
- **Order matters**: the stack runs top to bottom. Filters (Shadow, Blur, Glow, Grain, Displace, Bevel,
  Thicken, Tone) and Mask always apply after the whole stack, whatever their position.
- **Ids** must be unique across nodes and across effects (tracks and interactions refer to them).
- **Colours** are `#rrggbb` strings.
- **Fonts of a text**: `font` is the family alone (a Fontsource one, e.g. `JetBrains Mono`) and `weight`
  and `italic` are apart. A name with the style inside (`JetBrains Mono Bold`) is a name from before the
  weights existed: the editor still has it, but only the editor.
- The editor is at the project's site; a scene can be opened there to check it visually.
