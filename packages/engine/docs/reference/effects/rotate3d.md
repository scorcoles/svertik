# Transform 3D

`type: "rotate3d"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

Moves and rotates the drawing in 3D around a pivot, then projects it onto 2D with perspective. Positive Translate Z moves it toward the viewer and makes it appear larger; negative values move it farther away. X/Y tilt and Z spins the drawing.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `rotateX` | angle | `30` | degrees | label: Tilt X |
| `rotateY` | angle | `0` | degrees | label: Tilt Y |
| `rotateZ` | angle | `0` | degrees | label: Spin Z |
| `translateZ` | number | `0` | step 1 | unit: px; group: Position; label: Translate Z |
| `perspective` | number | `2` | min 0.5, max 10, step 0.1 | fraction of the drawing size; group: Camera |
| `pivot` | point | `[0.5,0.5]` | [x, y], fractions of the box (0–1) | group: Camera |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "rotate3d-1",
  "type": "rotate3d",
  "params": {
    "rotateX": 30,
    "rotateY": 0,
    "rotateZ": 0,
    "translateZ": 0,
    "perspective": 2,
    "pivot": [
      0.5,
      0.5
    ]
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
