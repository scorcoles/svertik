# Shear

`type: "shear"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

Slants the drawing: X shifts with the height and Y with the width, around the center.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `x` | angle | `20` | degrees | label: Shear X |
| `y` | angle | `0` | degrees | label: Shear Y |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "shear-1",
  "type": "shear",
  "params": {
    "x": 20,
    "y": 0
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
