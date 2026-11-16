# Clone

`type: "clone"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Generate**.

Duplicates the drawing in a grid, concentric rings or a line, around the original. Grid can pack 2×2 large copies by reserving their cells, so the copies do not overlap; Gap sets the clear space between cells, Big / normal sets their share and Seed shuffles their placement. In Radial, Count copies are placed on each of Rings circles; Ring spacing controls the distance between radii. In `object` mode, on another object: along its outline, on its vertices or inside it (random, with a seed). Each copy is an element. Fill keeps a share of the grid cells (a 2×2 copy counts as four): at random with Fill direction 0, or growing from the side Fill angle points to (90° is the bottom) towards 1, with a ragged edge; Fill seed varies it.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `mode` | enum | `"grid"` | `grid`, `radial`, `linear`, `object` | not animatable |
| `count` | number | `6` | min 1, max 256, step 1 | only when `mode` is `radial` or `linear` or `object` |
| `columns` | number | `3` | min 1, max 256, step 1 | group: Grid |
| `rows` | number | `3` | min 1, max 256, step 1 | group: Grid |
| `spacing` | point | `[1.1,1.1]` | [x, y], fractions of the box (0–1) | only when `packLarge` is `off`; group: Grid |
| `packLarge` | enum | `"off"` | `off`, `2x2` | not animatable; group: Grid; label: Pack large copies |
| `largeRatio` | number | `0.16` | min 0, max 0.5, step 0.01 | only when `packLarge` is `2x2`; group: Grid; label: Big / normal |
| `gridSeed` | seed | `1` | integer | only when `packLarge` is `2x2`; group: Grid; label: Seed |
| `gap` | number | `12` | min 0, max 500, step 1 | unit: px; only when `packLarge` is `2x2`; group: Grid |
| `fill` | number | `1` | min 0, max 1, step 0.01 | group: Grid |
| `fillDirection` | number | `0` | min 0, max 1, step 0.01 | group: Grid; label: Fill direction |
| `fillAngle` | angle | `90` | degrees | group: Grid; label: Fill angle |
| `fillSeed` | seed | `1` | integer | group: Grid; label: Fill seed |
| `radius` | number | `1` | min 0, max 5, step 0.01 | fraction of the drawing size; group: Radial |
| `rings` | number | `1` | min 1, max 64, step 1 | group: Radial |
| `ringSpacing` | number | `1.1` | min 0, max 5, step 0.01 | fraction of the drawing size; group: Radial; label: Ring spacing |
| `align` | boolean | `true` |  |  |
| `startAngle` | angle | `0` | degrees | group: Radial; label: Start |
| `offset` | point | `[1.1,0]` | [x, y], fractions of the box (0–1) | group: Linear |
| `scaleStep` | number | `1` | min 0, max 2, step 0.01 | group: Linear; label: Scale step |
| `rotateStep` | angle | `0` | degrees | group: Linear; label: Rotate step |
| `even` | boolean | `false` |  | not animatable; group: Linear; label: Even gaps |
| `target` | node | `""` | id of another node | group: Object; label: Object |
| `place` | enum | `"contour"` | `contour`, `vertices`, `inside` | not animatable; group: Object |
| `seed` | seed | `1` | integer | group: Object |
| `jitter` | point | `[0,0]` | [x, y], fractions of the box (0–1) | group: Variation; label: Position jitter |
| `scaleMin` | number | `1` | min 0.05, max 4, step 0.01 | group: Variation; label: Scale min |
| `scaleMax` | number | `1` | min 0.05, max 4, step 0.01 | group: Variation; label: Scale max |
| `rotateJitter` | angle | `0` | degrees | group: Variation; label: Rotation jitter |
| `variationSeed` | seed | `1` | integer | group: Variation; label: Variation seed |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "clone-1",
  "type": "clone",
  "params": {
    "mode": "grid",
    "count": 6,
    "columns": 3,
    "rows": 3,
    "spacing": [
      1.1,
      1.1
    ],
    "packLarge": "off",
    "largeRatio": 0.16,
    "gridSeed": 1,
    "gap": 12,
    "fill": 1,
    "fillDirection": 0,
    "fillAngle": 90,
    "fillSeed": 1,
    "radius": 1,
    "rings": 1,
    "ringSpacing": 1.1,
    "align": true,
    "startAngle": 0,
    "offset": [
      1.1,
      0
    ],
    "scaleStep": 1,
    "rotateStep": 0,
    "even": false,
    "target": "",
    "place": "contour",
    "seed": 1,
    "jitter": [
      0,
      0
    ],
    "scaleMin": 1,
    "scaleMax": 1,
    "rotateJitter": 0,
    "variationSeed": 1
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
