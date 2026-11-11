# Transform

`type: "transform"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

Moves, rotates and scales the whole drawing, around a pivot. Offsets are in drawing units (px).

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `x` | number | `0` | step 1 | unit: px |
| `y` | number | `0` | step 1 | unit: px |
| `rotation` | angle | `0` | degrees |  |
| `scale` | number | `1` | min 0, step 0.01 |  |
| `pivot` | point | `[0.5,0.5]` | [x, y], fractions of the box (0–1) | group: Pivot |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "transform-1",
  "type": "transform",
  "params": {
    "x": 0,
    "y": 0,
    "rotation": 0,
    "scale": 1,
    "pivot": [
      0.5,
      0.5
    ]
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
