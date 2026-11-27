# @svertik/js — svertikJS

Write svertik scenes in JavaScript. Objects chain their effects and tweens; `scene(…)` builds a plain
`SceneV1`. The code runs once and leaves JSON: nothing of it runs per frame.

```ts
import { scene, ellipse, expose, fx } from '@svertik/js';

const radius = expose('radius', 12, { label: 'Circle radius', min: 2, max: 40, step: 1 });

const dots = ellipse('dots', { width: radius.times(2), height: radius.times(2), fill: '#ffffff' })
  .clone({ mode: 'grid', columns: 15, rows: 15 })
  .spherize({ radius: 0.6, strength: 0 }, (s) =>
    s.to({ strength: 1, duration: 1, ease: 'power2.inOut', repeat: -1, yoyo: true }))
  .rigidPieces();

const orbit = ellipse('orbit', { width: 8, height: 8, fill: '#ffcc00' })
  .clone({ mode: 'radial', count: 24, radius: 43.75 })
  .each({ width: fx`8 + sin(element.index / element.count * 2*pi * 3) * 4` })
  .to({ rotation: 360, duration: 12, ease: 'none', repeat: -1 });

export default scene({ width: 800, height: 800, background: '#111111' }, dots, orbit);
```

Render it with the CLI: `pnpm svertik render scene.ts -o out.png` (also `.js` and `.mjs`; `info` works too).
In code, `scene(…).build()` gives `{ scene, warnings }`, and `JSON.stringify(scene(…))` the SceneV1.

## Objects

One factory per shape: `rectangle`, `ellipse`, `donut`, `polygon`, `star`, `cross`, `arrow`, `line`,
`spiral`, `text`, `path`, `pawn`, `randomWave`, `randomBars`. An optional name comes first:
`ellipse('Dots', { … })`. The id is made from it (`dots`; `star`, `star_2`… without a name); fix one with
`.set({ id: 'logo' })` when something points at the object by id. Also `group(name?, ...children)`,
`layer(name, ...children)`, `svg(name?, markup)`, `instance(name?, { of, mouse? })`,
`composition(name, scene(…), params?, modulation?)` and `raw({ … })`, a node written as scene JSON and kept
as it is (packs, Effector nodes, SVGs kept in their own file).

- Every method changes the object and returns it, so chaining and one call per line work the same.
- `.set({ x, y, scale, rotation, opacity, visible, blend, name, id, … })`: placement, node fields and the
  shape's own values.
- `fill: '#fff'` is `fill: true, fillColor: '#fff'` (`stroke` alike); `'none'` turns it off.
- Creating an object doesn't draw it: it is drawn when it goes into `scene(…)` or a group. References
  (`of`, Mirror's `reference`, Mouse's `target`…) take the object itself and become its id.

## Effects

One chain method per effect, with the engine's parameter names: `.clone()`, `.twist()`, `.spherize()`,
`.roundCorners()`, `.vectorGrain()`… A name may come first (`.twist('Swirl', { angle: 45 })`, shown in the
editor's stack); the id is `<object>_<type>` unless `.withId()` fixes it. A callback after the parameters
gets the effect, to animate it without breaking the chain; `.off()` turns it off and `.withProps()` forwards
values to nested effects. The same names are free-standing factories (`const s = spherize({ … })`, then `.add(s)`), and
`.effect(type, params)` takes any type.

Effectors (`step`, `stagger`, `range`, `field`, `each`, `oscillate`, `wiggle`, `pulse`, `shake`…) take
their nested effects after the parameters: `.stagger({ stagger: 0.2 }, transform({ y: -20 }))`. An
effector inside another throws. `.each({ … })` with values that aren't Each's own makes a Shape
(`shapevalues`) for every copy.

## Values

- ``fx`…` `` is a ƒx formula, evaluated per frame (`{ $expr, fallback }`). Interpolated variables become
  their reference: ``fx`${radius} * 2` ``. The fallback is the formula's value at time 0, or
  ``fx({ fallback: 12 })`…` ``.
- `custom(name, value)` and `expose(name, value, { label, min, max, step, unit })` are scene variables
  (`scene.custom.name`); used as values, they become formulas. `.times()`, `.plus()`, `.minus()`,
  `.div()` build formulas from them. Variables are declared in the scene when something uses them.

## Tweens

`.to(vars)`, `.from(vars)` and `.fromTo(fromVars, toVars)` on objects and effects. `vars` holds the
properties plus `duration` (0.5 s), `delay`, `ease`, `repeat` (-1: forever), `yoyo` and `repeatDelay`.
On objects: x, y, scale, rotation, opacity, and on shapes any of their values (`fill: '#f0c'` animates
`fillColor`). Each property becomes a track; tweens on the same property continue it.

Eases: `none`, `power1`–`power4`, `sine`, `circ`, `expo`, `back`, `elastic`, `bounce`, each with `.in`,
`.out` (the default) or `.inOut`; also the engine's names and `[x1, y1, x2, y2]`. The default is
`power1.out`. Curves the engine lacks are Bézier approximations; `elastic.inOut` and `bounce.inOut` fall
back to `.out` with a warning.

`.keys(param, [{ t, value, ease? }, …], { repeat?, every?, on? })` writes keys out, for anything a tween
doesn't say (three or more keys, holds, a composition's clock with `on: 'composition'`).

Without `duration` in `scene(…)`, the animation lasts until the last tween that doesn't repeat forever
ends; with one that does, the scene loops.

## Scene options

`width`, `height`, `background`, `duration`, `fps`, `loop`, `infinite`, `seed`, `seedEvery`, `seedOnLoad`,
`notes`, `fit` (Play's fit to the screen), `walls` (document edges as Physics walls), `clip` (Play hides
what lies outside the document), `custom` (variables to declare even if unused), `autoplay`, `markers`,
`interactions` (as scene JSON) and `extra` (any other scene field, as JSON).

## Scene → code, code → scene

`toCode(scene)` writes any SceneV1 as svertikJS (the editor's JS tab shows it), and `runCode(code)` runs such
code and builds its scene. Going round keeps everything but ids nothing points at (they become readable,
from the names) and parameters at their default (left out); printing the result again gives the same code.
A test runs every demo and recipe round, checking that it validates and draws the same paths.

## Keeping it in step with the engine

`src/generated.ts` (factories, chain methods and parameter types with label, default, range and unit) is
written from the engine's registries by `pnpm --filter @svertik/js generate`. A test fails while it is
stale.
