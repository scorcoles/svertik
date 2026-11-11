# Mosaic

`type: "mosaic"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Generate**.

Cuts the drawing into tiles on a grid of columns × rows, with a gutter and a rotated grid: rectangles, triangles, hexagons, or one shape per cell (circle, polygon, star or another object). `cut` clips the drawing with each tile; `whole` places whole tiles where the drawing covers at least half.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `columns` | number | `8` | min 1, max 60, step 1 |  |
| `rows` | number | `8` | min 1, max 60, step 1 |  |
| `tile` | enum | `"rect"` | `rect`, `triangle`, `hexagon`, `circle`, `polygon`, `star`, `shape` | not animatable |
| `sides` | number | `5` | min 3, max 12, step 1 | only when `tile` is `polygon` or `star` |
| `source` | node | `""` | id of another node | only when `tile` is `shape`; label: Shape |
| `fit` | enum | `"cut"` | `cut`, `whole` | not animatable |
| `gutter` | point | `[4,4]` | [x, y], px | unit: px |
| `angle` | angle | `0` | degrees |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "mosaic-1",
  "type": "mosaic",
  "params": {
    "columns": 8,
    "rows": 8,
    "tile": "rect",
    "sides": 5,
    "source": "",
    "fit": "cut",
    "gutter": [
      4,
      4
    ],
    "angle": 0
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
