# svertik

**Alpha 0.0.1.** Non-destructive SVG editor: an SVG (or a primitive, or text) and a stack of effects recalculated live by a JS engine. The original geometry is never touched. Animate it with a timeline and bring it to any website as-is: flat SVG, the project in JSON, or runtime code reproducing the effects and animation.

An experiment by [VERTIK](https://www.vertik.net).  
**For AI Agents & Headless Engine Use:** [AGENTS.md](AGENTS.md) · [Engine & 58 Effects Guide](docs/ENGINE_AND_EFFECTS.md) · [Scene Recipes](docs/SCENE_RECIPES.md).

## Features

- **Effects** (more than 50):
  - **Deform:** Transform, Rotate 3D, Spherize, Twist, Bend, Taper, Shear, Wave, Ripple, Noise, Roughen, Round Corners, Melt, Cylinder, Perspective, Envelope, Path Wrap, Morph, Trim.
  - **Generate:** Crack, Damage, Clone, Mirror, Mosaic, Fractal, Glitch, Boolean, Metaball, Pixelate.
  - **Effect** (per element): Step, Stagger, Range, Field, Explosion.
  - **Style:** Color, Tint, Paint, Gradient, Opacity, Mask.
  - **Filters:** Shadow, Blur, Glow, Grain, Displace, Bevel, Thicken, Tone.
- **Utils:** Instance (live copy of another object, with its own placement and stacked effects), Effector (applies its stack to other objects separately, with staggered delay), Follow Path (rigidly tracks another object's path), Connector (dynamic line between two objects following them, with arrows), Tracer (motion trail of an object during animation), and Look At (rotates an object to face another).
- **Primitives** (rectangle, ellipse, polygon, star, line, spiral, pawn) and **Text** converted to vector outlines (one piece per letter).
- **Animation:** keyframes on any value, easing curves (including back, elastic, bounce), and letter entrance presets.
- **`.svrtk` Projects:** save (⌘S) and reopen (⌘O or dragging the file). Export to SVG and PNG. The "svertik" menu includes built-in demos.
- **Strictly SVG:** exports pure, standard SVG.

## Getting Started

```bash
pnpm install
pnpm editor     # launches the web editor
pnpm test       # runs tests (engine, UI, and editor)
pnpm typecheck
pnpm storybook  # UI components
```

## Terminal CLI

```bash
pnpm svertik render project.svrtk -o poster.png --scale 3 --background '#0d0d10'
pnpm svertik render project.svrtk --frames frames/   # full animation as PNG frames
pnpm svertik info project.svrtk
pnpm svertik effects --json                         # lists effects and parameters
```

## The Engine on the Web

```ts
import { builtins, createEngine } from '@svertik/engine';

const engine = createEngine(builtins);
const scene = {
  version: 2,
  objects: [
    {
      kind: 'object',
      id: 'logo',
      name: 'logo',
      source: '<svg viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80"/></svg>',
      stack: [
        { id: 'a', type: 'spherize', params: { strength: 0.6 } },
        { id: 'b', type: 'wave', params: { phase: 0 } },
      ],
    },
  ],
};

engine.toSVG(scene);                     // Flat standalone SVG
const live = engine.mount(svgEl, scene); // Mounted live into an <svg>
scene.objects[0].stack[1].params.phase = 90;
live.update(scene);                      // Efficiently recomputed only downstream from "wave"
```

The editor generates this code (including animations) in its **Code** panel.

## License

MIT. Bundled fonts (JetBrains Mono) are licensed under OFL.
