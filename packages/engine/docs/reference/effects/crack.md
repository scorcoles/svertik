# Crack

`type: "crack"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Deform**.

Fractures filled shapes with either branching cracks from an impact or edge-to-edge slices. In Impact pattern, Spread controls where side branches form: lower values strongly concentrate them near the impact without reducing their expected count; 1 distributes them evenly along the cracks. `cut` cuts lines as gaps of `width` px; `shatter` cuts them into elements and pushes the loose pieces apart. Separation sets the distance and Variation controls how much that distance differs between pieces, deterministically from the seed.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `mode` | enum | `"cut"` | `cut`, `shatter` | not animatable |
| `pattern` | enum | `"impact"` | `impact`, `slices` | not animatable |
| `growth` | number | `1` | min 0, max 1, step 0.01 |  |
| `cracks` | number | `5` | min 1, max 16, step 1 | only when `pattern` is `impact` |
| `length` | number | `0.6` | min 0, max 2, step 0.01 | fraction of the drawing size; only when `pattern` is `impact` |
| `branching` | number | `0.35` | min 0, max 1, step 0.01 | only when `pattern` is `impact` |
| `spread` | number | `1` | min 0, max 1, step 0.01 | only when `pattern` is `impact` |
| `jagged` | number | `0.4` | min 0, max 1, step 0.01 | only when `pattern` is `impact` |
| `width` | number | `1` | min 0, max 10, step 0.1 | unit: px |
| `separation` | number | `6` | min 0, max 80, step 0.5 | unit: px; only when `mode` is `shatter`; group: Shatter |
| `variation` | number | `0.4` | min 0, max 1, step 0.01 | only when `mode` is `shatter`; group: Shatter |
| `slices` | number | `5` | min 1, max 16, step 1 | only when `pattern` is `slices`; group: Slices; label: Count |
| `angle` | angle | `0` | degrees | only when `pattern` is `slices`; group: Slices |
| `angleVariation` | angle | `24` | degrees | only when `pattern` is `slices`; group: Slices; label: Variation |
| `impact` | point | `[0.4,0.35]` | [x, y], fractions of the box (0–1) | only when `pattern` is `impact`; group: Impact; label: Point |
| `seed` | seed | `1` | integer |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "crack-1",
  "type": "crack",
  "params": {
    "mode": "cut",
    "pattern": "impact",
    "growth": 1,
    "cracks": 5,
    "length": 0.6,
    "branching": 0.35,
    "spread": 1,
    "jagged": 0.4,
    "width": 1,
    "separation": 6,
    "variation": 0.4,
    "slices": 5,
    "angle": 0,
    "angleVariation": 24,
    "impact": [
      0.4,
      0.35
    ],
    "seed": 1
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
