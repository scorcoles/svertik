# Roughen

`type: "roughen"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

Fractal edges on any drawing: `organic` tears the outline (midpoint displacement, like a coastline or torn paper); `koch` turns each segment into a Koch peak, `iterations` times. Curves become straight segments.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `mode` | enum | `"organic"` | `organic`, `koch` | not animatable |
| `amount` | number | `0.5` | min 0, max 1, step 0.01 | group: Organic |
| `detail` | number | `0.02` | min 0.004, max 0.2, step 0.001 | fraction of the drawing size; group: Organic |
| `seed` | seed | `1` | integer | group: Organic |
| `iterations` | number | `2` | min 1, max 4, step 1 | group: Koch |
| `height` | number | `0.29` | min -0.6, max 0.6, step 0.01 | group: Koch; label: Peak |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "roughen-1",
  "type": "roughen",
  "params": {
    "mode": "organic",
    "amount": 0.5,
    "detail": 0.02,
    "seed": 1,
    "iterations": 2,
    "height": 0.29
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
