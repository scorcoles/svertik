# Clone

`type: "clone"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Generate**.

Duplicates the drawing in a grid, a circle or a line, around the original. In `object` mode, on another object: along its outline, on its vertices or inside it (random, with a seed). Each copy is an element.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `mode` | enum | `"grid"` | `grid`, `radial`, `linear`, `object` | not animatable |
| `count` | number | `6` | min 1, max 64, step 1 |  |
| `columns` | number | `3` | min 1, max 16, step 1 | group: Grid |
| `rows` | number | `3` | min 1, max 16, step 1 | group: Grid |
| `spacing` | point | `[1.1,1.1]` | [x, y], fractions of the box (0–1) | group: Grid |
| `radius` | number | `1` | min 0, max 5, step 0.01 | fraction of the drawing size; group: Radial |
| `align` | boolean | `true` |  |  |
| `startAngle` | angle | `0` | degrees | group: Radial; label: Start |
| `offset` | point | `[1.1,0]` | [x, y], fractions of the box (0–1) | group: Linear |
| `scaleStep` | number | `1` | min 0, max 2, step 0.01 | group: Linear; label: Scale step |
| `rotateStep` | angle | `0` | degrees | group: Linear; label: Rotate step |
| `even` | boolean | `false` |  | not animatable; group: Linear; label: Even gaps |
| `target` | node | `""` | id of another node | group: Object; label: Object |
| `place` | enum | `"contour"` | `contour`, `vertices`, `inside` | not animatable; group: Object |
| `seed` | seed | `1` | integer | group: Object |

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
    "radius": 1,
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
    "seed": 1
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
