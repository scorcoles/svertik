# Crack

`type: "crack"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Generate**.

Branching cracks from an impact point. `lines` draws them on top; `cut` cuts them as gaps of `width` px; `shatter` cuts them and pushes each loose piece away from the impact (each piece, an element).

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `mode` | enum | `"cut"` | `lines`, `cut`, `shatter` | not animatable |
| `growth` | number | `1` | min 0, max 1, step 0.01 |  |
| `cracks` | number | `5` | min 1, max 16, step 1 |  |
| `length` | number | `0.6` | min 0, max 2, step 0.01 | fraction of the drawing size |
| `branching` | number | `0.35` | min 0, max 1, step 0.01 |  |
| `jagged` | number | `0.4` | min 0, max 1, step 0.01 |  |
| `width` | number | `1` | min 0, max 10, step 0.1 | unit: px; group: Style |
| `color` | color | `"#000000"` | #rrggbb | group: Style |
| `separation` | number | `6` | min 0, max 80, step 0.5 | unit: px; group: Shatter |
| `impact` | point | `[0.4,0.35]` | [x, y], fractions of the box (0–1) | group: Impact; label: Point |
| `seed` | seed | `1` | integer | group: Impact |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "crack-1",
  "type": "crack",
  "params": {
    "mode": "cut",
    "growth": 1,
    "cracks": 5,
    "length": 0.6,
    "branching": 0.35,
    "jagged": 0.4,
    "width": 1,
    "color": "#000000",
    "separation": 6,
    "impact": [
      0.4,
      0.35
    ],
    "seed": 1
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
