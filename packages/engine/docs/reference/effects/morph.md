# Morph

`type: "morph"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

Morphs this drawing into another object's shape. Paths are paired (largest with largest), resampled to the same number of points and interpolated; extra paths grow from (or shrink to) a point. Fill and stroke blend too. With `steps`, the in-between shapes as separate elements.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `target` | node | `""` | id of another node | label: To |
| `amount` | number | `0.5` | min 0, max 1, step 0.01 |  |
| `points` | number | `200` | min 16, max 1000, step 8 |  |
| `colors` | boolean | `true` |  | not animatable; label: Blend colors |
| `steps` | number | `0` | min 0, max 100, step 1 |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "morph-1",
  "type": "morph",
  "params": {
    "target": "",
    "amount": 0.5,
    "points": 200,
    "colors": true,
    "steps": 0
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
