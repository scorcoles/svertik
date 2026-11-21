# Dithering

`type: "dithering"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Generate**.

Converts sampled tone into a binary grid of vector cells. Bayer uses an ordered 2×2 to 16×16 threshold matrix; Floyd–Steinberg and Atkinson diffuse quantization error for smoother tonal patterns; Noise uses a repeatable seeded random threshold. Cell size, angle, threshold, gamma and invert control the result. Cells keep their sampled source colour; add Color or Tint after Dithering to style them. Merge combines contiguous cells into larger same-colour rectangles. Large grids increase cell size automatically to keep sampling bounded.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `spacing` | number | `6` | min 1, max 100, step 0.5 | unit: px; label: Cell size |
| `angle` | angle | `0` | degrees |  |
| `algorithm` | enum | `"bayer"` | `bayer`, `floyd-steinberg`, `atkinson`, `noise` | not animatable |
| `matrix` | enum | `"4"` | `2`, `4`, `8`, `16` | not animatable; only when `algorithm` is `bayer`; label: Bayer matrix |
| `threshold` | number | `0.5` | min 0, max 1, step 0.01 |  |
| `gamma` | number | `1` | min 0.1, max 4, step 0.05 |  |
| `invert` | boolean | `false` |  |  |
| `seed` | seed | `1` | integer |  |
| `offset` | point | `[0,0]` | [x, y], fractions of the box (0–1) |  |
| `merge` | boolean | `true` |  | not animatable; label: Merge cells |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "dithering-1",
  "type": "dithering",
  "params": {
    "spacing": 6,
    "angle": 0,
    "algorithm": "bayer",
    "matrix": "4",
    "threshold": 0.5,
    "gamma": 1,
    "invert": false,
    "seed": 1,
    "offset": [
      0,
      0
    ],
    "merge": true
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
