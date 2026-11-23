# Contour

`type: "contour"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Generate**.

Draws vector isolines through equal tones in the input, like elevation lines on a map. Sample spacing controls detail; Levels sets how many tone bands are outlined. Gamma and Invert reshape the tonal map; line width and Merge control the paths. Lines retain sampled source colour; use Color or Tint after Contour to style them. Large grids adapt their spacing to bound work.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `spacing` | number | `6` | min 1, max 100, step 0.5 | unit: px; label: Sample spacing |
| `levels` | number | `6` | min 1, max 16, step 1 |  |
| `width` | number | `1` | min 0.1, max 20, step 0.1 | unit: px; label: Line width |
| `gamma` | number | `1` | min 0.1, max 4, step 0.05 |  |
| `invert` | boolean | `false` |  |  |
| `merge` | boolean | `true` |  | not animatable; label: Merge contours |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "contour-1",
  "type": "contour",
  "params": {
    "spacing": 6,
    "levels": 6,
    "width": 1,
    "gamma": 1,
    "invert": false,
    "merge": true
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
