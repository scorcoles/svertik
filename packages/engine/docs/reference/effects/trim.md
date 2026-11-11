# Trim

`type: "trim"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

Trims paths (draws them): only the part of each path between Start and End (fractions of its length) remains, shifted by Offset; closed paths wrap around. Animate End from 0 to 1 and the stroke draws itself.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `start` | number | `0` | min 0, max 1, step 0.01 |  |
| `end` | number | `0.5` | min 0, max 1, step 0.01 |  |
| `offset` | number | `0` | min -1, max 1, step 0.01 |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "trim-1",
  "type": "trim",
  "params": {
    "start": 0,
    "end": 0.5,
    "offset": 0
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
