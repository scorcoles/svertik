# Ripple

`type: "ripple"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

Concentric waves from a point, like a drop in water; they fade with the distance.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `amplitude` | number | `0.03` | min 0, max 0.2, step 0.005 | fraction of the drawing size |
| `wavelength` | number | `0.15` | min 0.02, max 1, step 0.01 | fraction of the drawing size |
| `phase` | angle | `0` | degrees |  |
| `decay` | number | `1` | min 0, max 5, step 0.1 |  |
| `center` | point | `[0.5,0.5]` | [x, y], fractions of the box (0–1) |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "ripple-1",
  "type": "ripple",
  "params": {
    "amplitude": 0.03,
    "wavelength": 0.15,
    "phase": 0,
    "decay": 1,
    "center": [
      0.5,
      0.5
    ]
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
