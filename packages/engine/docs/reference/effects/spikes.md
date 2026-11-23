# Spikes

`type: "spikes"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

Regular spikes along the outline: `count` tips per path, evenly spaced, `height` px out (negative: inwards). `curve` shapes the sides: 0 straight, towards 1 hollow like thorns, towards -1 bulging like petals. `width` leaves outline between spikes, `lean` tilts the tips and `phase` slides them along.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `count` | number | `12` | min 1, max 200, step 1 |  |
| `height` | number | `30` | min -500, max 500, step 0.5 | unit: px |
| `curve` | number | `0` | min -1, max 1, step 0.01 |  |
| `width` | number | `1` | min 0.05, max 1, step 0.01 | fraction of the drawing size |
| `lean` | number | `0` | min -1, max 1, step 0.01 |  |
| `phase` | number | `0` | min 0, max 1, step 0.01 | fraction of the drawing size |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "spikes-1",
  "type": "spikes",
  "params": {
    "count": 12,
    "height": 30,
    "curve": 0,
    "width": 1,
    "lean": 0,
    "phase": 0
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
