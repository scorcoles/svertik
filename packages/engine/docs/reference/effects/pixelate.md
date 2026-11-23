# Pixelate

`type: "pixelate"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Generate**.

Everything made of little squares, like pixel art: a grid of `size` px where each cell takes the colour of what is on top at its centre (stroke or fill). Runs of the same colour are merged; `gap` and `dot` give an LED-screen look. Vector, sharp at any size.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `size` | number | `8` | min 0, max 200, step 0.5 | unit: px |
| `gap` | number | `0` | min 0, max 50, step 0.5 | unit: px |
| `shape` | enum | `"square"` | `square`, `dot` | not animatable |
| `offset` | point | `[0,0]` | [x, y], fractions of the box (0–1) |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "pixelate-1",
  "type": "pixelate",
  "params": {
    "size": 8,
    "gap": 0,
    "shape": "square",
    "offset": [
      0,
      0
    ]
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
