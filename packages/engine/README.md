# @svertik/engine

Non-destructive SVG effects and motion. Describe a scene in JSON (objects, a stack of effects on each one,
keyframes, interactions) and the engine turns it into plain SVG. Nothing is baked: change a parameter and
the result is recomputed. It is the engine behind the svertik editor.

```ts
import { builtins, createEngine } from '@svertik/engine';

const svg = createEngine(builtins).toSVG({
  version: 2,
  objects: [{ kind: 'shape', id: 'star', name: 'Star', shape: 'star', params: {}, stack: [{ id: 'tw', type: 'twist', params: { angle: 60 } }] }],
});
```

- 50+ effects: deformers (Bend, Twist, Spherize, Bones…), generators (Clone, Mosaic, Boolean, Metaball,
  Pixelate…), per-element effectors (Step, Stagger, Range, Field), styles, SVG filters and masks.
- Keyframe animation, interactions (hover, click, scroll, pointer) and a player for the browser.
- Export to plain SVG, animated SVG and Lottie.

**Docs** ship with the package: [`AGENTS.md`](AGENTS.md) (usage and the scene format, written for agents and
developers alike) and [`docs/reference`](docs/reference/index.md) (every effect and primitive, generated
from their schemas).

> Alpha: the API and the scene format may still change between 0.x versions.

MIT licensed.
