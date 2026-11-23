# Twist

`type: "twist"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

A whirl: turns more the closer a point is to the center, and nothing at the edge of the radius.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `center` | point | `[0.5,0.5]` | [x, y], fractions of the box (0–1) | group: Falloff |
| `radius` | number | `0.6` | min 0, max 2, step 0.01 | fraction of the drawing size; group: Falloff |
| `angle` | angle | `90` | degrees |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "twist-1",
  "type": "twist",
  "params": {
    "center": [
      0.5,
      0.5
    ],
    "radius": 0.6,
    "angle": 90
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
