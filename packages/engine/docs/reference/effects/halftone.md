# Halftone

`type: "halftone"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Generate**.

A halftone screen: the drawing sampled on a rotated grid where each cell becomes a mark (circle, square, diamond, line or ring) sized by the tone. Spacing, angle, min/max size, gamma, ink/original colour, invert and jitter control the look.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `spacing` | number | `10` | min 1, max 200, step 0.5 | unit: px |
| `angle` | angle | `45` | degrees |  |
| `min` | number | `0` | min 0, max 1.5, step 0.01 |  |
| `max` | number | `0.9` | min 0, max 1.5, step 0.01 |  |
| `gamma` | number | `1` | min 0.1, max 4, step 0.05 |  |
| `shape` | enum | `"circle"` | `circle`, `square`, `diamond`, `line`, `ring` | not animatable |
| `color` | enum | `"original"` | `original`, `ink` | not animatable |
| `ink` | color | `"#111111"` | #rrggbb | only when `color` is `ink` |
| `invert` | boolean | `false` |  |  |
| `jitter` | number | `0` | min 0, max 1, step 0.01 |  |
| `seed` | seed | `1` | integer |  |
| `offset` | point | `[0,0]` | [x, y], fractions of the box (0–1) |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "halftone-1",
  "type": "halftone",
  "params": {
    "spacing": 10,
    "angle": 45,
    "min": 0,
    "max": 0.9,
    "gamma": 1,
    "shape": "circle",
    "color": "original",
    "ink": "#111111",
    "invert": false,
    "jitter": 0,
    "seed": 1,
    "offset": [
      0,
      0
    ]
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
