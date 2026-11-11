# Fractal

`type: "fractal"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Generate**.

Repeats the drawing inside itself, smaller each time (an iterated function system): Sierpinski triangle, Sierpinski carpet, a branching tree or a spiral. Capped at 4,096 copies.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `preset` | enum | `"sierpinski"` | `sierpinski`, `carpet`, `tree`, `spiral` | not animatable |
| `depth` | number | `4` | min 1, max 12, step 1 |  |
| `ratio` | number | `0.7` | min 0.2, max 0.95, step 0.01 | label: Scale |
| `angle` | angle | `25` | degrees |  |
| `fit` | boolean | `true` |  | not animatable |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "fractal-1",
  "type": "fractal",
  "params": {
    "preset": "sierpinski",
    "depth": 4,
    "ratio": 0.7,
    "angle": 25,
    "fit": true
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
