# String Art

`type: "stringart"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Draw**.

Samples evenly spaced points around each closed contour and connects each point to another a fixed number of steps ahead, drawing a modular chord pattern as editable vector lines. Points controls the sampling resolution, Skip changes the star pattern and Phase shifts where sampling begins.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `points` | number | `120` | min 8, max 256, step 1 |  |
| `skip` | number | `37` | min 1, max 255, step 1 |  |
| `phase` | angle | `0` | degrees |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "stringart-1",
  "type": "stringart",
  "params": {
    "points": 120,
    "skip": 37,
    "phase": 0
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
