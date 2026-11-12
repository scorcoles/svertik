# svertik Guide for AI Agents (Headless & No-MCP)

> **svertik** is a non-destructive SVG procedural generation and motion graphics engine.  
> Projects and scenes are expressed in **pure JSON (`SceneV2`)**, evaluated through a stack of modifiers on cubic Bézier paths, and output as standard SVG. **No UI or MCP server is needed** to generate demos, construct scenes, or build animated graphics.

---

## 📚 Documentation & Reference

- **[Comprehensive Engine & 58 Effects Guide](docs/ENGINE_AND_EFFECTS.md)**: Deep dive into the architecture, execution rules, all 8 geometric primitives, and all 58 effects with parameter types, ranges, defaults, and notes.
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
import { builtins, createEngine, validateScene, type SceneV2 } from '@svertik/engine';

const scene: SceneV2 = {
  version: 2,
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

## ⚡ Golden Rules for `SceneV2`

1. **`version: 2`**: Mandatory field.
2. **Layer Order (`objects`)**: The **first object in the array (`index 0`) is drawn in FRONT** (closest to the viewer), identical to layer stacks in Figma or Illustrator.
3. **Unique IDs**: Every `id` across `objects` and modifier `stack` items must be globally unique.
4. **Coordinate System**: Y increases downwards. Rotations are clockwise in degrees.
5. **Fractions vs Pixels**: Anchors and centres (`center`, `pivot`, `anchor`) use normalized `[fx, fy]` fractions (`0` to `1`, where `[0.5, 0.5]` is the bounding box centre).
6. **Effector Containers (`step`, `stagger`, `range`, `field`)**: Take nested modifiers inside their `children` array. **Never nest an effector inside another effector**.
7. **Filters (`kind: "filter"`) & Masks (`mask`)**: Always execute after the entire geometry stack has evaluated, regardless of array position.
8. **Text (`shape: "text"`)**: Each glyph is converted into an independent vector element, enabling `step`, `stagger`, `range`, or `explosion` to act character-by-character. Its `font` is a Fontsource family (`weight` and `italic` go apart, never inside the name).
