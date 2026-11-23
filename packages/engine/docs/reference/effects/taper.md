# Taper

`type: "taper"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

Narrows (or widens) one end: the width across the axis changes along it.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `amount` | number | `0.5` | min -1, max 1, step 0.01 |  |
| `curve` | number | `0` | min -1, max 1, step 0.01 |  |
| `axis` | enum | `"vertical"` | `vertical`, `horizontal` | not animatable |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "taper-1",
  "type": "taper",
  "params": {
    "amount": 0.5,
    "curve": 0,
    "axis": "vertical"
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
