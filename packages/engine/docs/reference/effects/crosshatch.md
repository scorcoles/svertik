# Crosshatch

`type: "crosshatch"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Generate**.

Pen-drawing shading with parallel lines: up to four layers of hatching (at Angle, then +90°, +45° and −45°), each drawn only where the tone is darker than its threshold, so dark areas get denser cross-hatching. Spacing, line width, gamma, ink/original colour, invert and offset control the look; Fix lines anchors the screen to the scene as the object moves, rotates or scales; off, the lines follow the object. Merge joins lines into one path per colour and keeps the whole drawing as one Gravity body, on both Solids and the Floor; off, each line is a separate body. Canvas handles adjust Offset, Angle and Spacing. Add Roughen after it for a hand-drawn line.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `spacing` | number | `6` | min 1, max 100, step 0.5 | unit: px |
| `angle` | angle | `45` | degrees |  |
| `layers` | number | `3` | min 1, max 4, step 1 |  |
| `width` | number | `1` | min 0.1, max 20, step 0.1 | unit: px; label: Line width |
| `gamma` | number | `1` | min 0.1, max 4, step 0.05 |  |
| `color` | enum | `"ink"` | `ink`, `original` | not animatable |
| `ink` | color | `"#111111"` | #rrggbb | only when `color` is `ink` |
| `invert` | boolean | `false` |  |  |
| `offset` | point | `[0,0]` | [x, y], fractions of the box (0–1) |  |
| `fixLines` | boolean | `false` |  | not animatable; label: Fix lines |
| `merge` | boolean | `false` |  | not animatable; label: Merge lines |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "crosshatch-1",
  "type": "crosshatch",
  "params": {
    "spacing": 6,
    "angle": 45,
    "layers": 3,
    "width": 1,
    "gamma": 1,
    "color": "ink",
    "ink": "#111111",
    "invert": false,
    "offset": [
      0,
      0
    ],
    "fixLines": false,
    "merge": false
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
