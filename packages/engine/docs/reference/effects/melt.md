# Melt

`type: "melt"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

The drawing drips downwards, more the lower it is; noise decides where the drops fall.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `amount` | number | `0.25` | min 0, max 1, step 0.01 | fraction of the drawing size |
| `drips` | number | `6` | min 1, max 30, step 1 |  |
| `sharpness` | number | `2` | min 0.5, max 6, step 0.1 |  |
| `seed` | seed | `1` | integer |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "melt-1",
  "type": "melt",
  "params": {
    "amount": 0.25,
    "drips": 6,
    "sharpness": 2,
    "seed": 1
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
