# Spherize

`type: "spherize"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

Bulges (strength > 0) or pinches (strength < 0) what falls inside a circle. The edge of the circle does not move, so there is no jump with what is outside.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `center` | point | `[0.5,0.5]` | [x, y], fractions of the box (0–1) | group: Falloff |
| `radius` | number | `0.5` | min 0, max 2, step 0.01 | fraction of the drawing size; group: Falloff |
| `strength` | number | `0.5` | min -1, max 1, step 0.01 |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "spherize-1",
  "type": "spherize",
  "params": {
    "center": [
      0.5,
      0.5
    ],
    "radius": 0.5,
    "strength": 0.5
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
