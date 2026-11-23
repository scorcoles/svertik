# Compress

`type: "compress"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

Crowds the drawing towards a center line along one axis (Strength > 0) or spreads it away from it (Strength < 0); both ends of the box stay put and the order of points is kept. The center goes from Center start at one edge (top for axis x, left for axis y) to Center end at the other. With Rigid Pieces first, evenly spaced marks keep their shape and pile into a solid bar at the center, so a Clone grid gets a dense band that can sweep diagonally row by row.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `axis` | enum | `"x"` | `x`, `y` | not animatable |
| `start` | number | `0.5` | min 0, max 1, step 0.01 | fraction of the drawing size; label: Center start |
| `end` | number | `0.5` | min 0, max 1, step 0.01 | fraction of the drawing size; label: Center end |
| `strength` | number | `0.7` | min -1, max 1, step 0.01 |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "compress-1",
  "type": "compress",
  "params": {
    "axis": "x",
    "start": 0.5,
    "end": 0.5,
    "strength": 0.7
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
