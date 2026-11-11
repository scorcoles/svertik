# Perspective

`type: "perspective"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

Free perspective: each corner of the drawing goes where you drag its handle.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `topLeft` | point | `[0.1,0]` | [x, y], fractions of the box (0–1) | label: Top left |
| `topRight` | point | `[0.9,0]` | [x, y], fractions of the box (0–1) | label: Top right |
| `bottomRight` | point | `[1,1]` | [x, y], fractions of the box (0–1) | label: Bottom right |
| `bottomLeft` | point | `[0,1]` | [x, y], fractions of the box (0–1) | label: Bottom left |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "perspective-1",
  "type": "perspective",
  "params": {
    "topLeft": [
      0.1,
      0
    ],
    "topRight": [
      0.9,
      0
    ],
    "bottomRight": [
      1,
      1
    ],
    "bottomLeft": [
      0,
      1
    ]
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
