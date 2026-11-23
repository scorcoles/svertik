# Cylinder

`type: "cylinder"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

Wraps the drawing around a vertical cylinder (like the label of a can). `wrap` is the part of the turn the drawing covers; the sides compress and move closer or away.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `wrap` | number | `0.5` | min 0.01, max 1, step 0.01 |  |
| `rotation` | angle | `0` | degrees |  |
| `perspective` | number | `0.15` | min 0, max 1, step 0.01 |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "cylinder-1",
  "type": "cylinder",
  "params": {
    "wrap": 0.5,
    "rotation": 0,
    "perspective": 0.15
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
