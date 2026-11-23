# Gather

`type: "gather"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

Squeezes the drawing towards one side along an axis, by an amount that changes across it: Start applies at one edge (top for axis x, left for axis y), End at the other, positive towards the left/top and negative towards the right/bottom. Straight lines across the axis stay straight, so a row of bars becomes a fan whose spacing drifts (weaves, moiré, fake perspective). Strokes keep their width.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `axis` | enum | `"x"` | `x`, `y` | not animatable |
| `start` | number | `0.5` | min -0.99, max 0.99, step 0.01 |  |
| `end` | number | `-0.5` | min -0.99, max 0.99, step 0.01 |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "gather-1",
  "type": "gather",
  "params": {
    "axis": "x",
    "start": 0.5,
    "end": -0.5
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
