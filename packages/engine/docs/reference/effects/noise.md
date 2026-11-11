# Noise

`type: "noise"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

Moves each point with smooth noise: an organic, hand-drawn look.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `amount` | number | `0.03` | min 0, step 0.005 | fraction of the drawing size |
| `scale` | number | `4` | min 0.1, step 0.1 | label: Frequency |
| `evolution` | number | `0` | step 0.01 | group: Variation |
| `seed` | seed | `1` | integer | group: Variation |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "noise-1",
  "type": "noise",
  "params": {
    "amount": 0.03,
    "scale": 4,
    "evolution": 0,
    "seed": 1
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
