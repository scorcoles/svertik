# Envelope

`type: "envelope"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

Envelope distortion: drag the nine points of the mesh and the drawing bends with it.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `p00` | point | `[0,0]` | [x, y], fractions of the box (0–1) | group: Mesh; label: Top left |
| `p10` | point | `[0.5,0]` | [x, y], fractions of the box (0–1) | group: Mesh; label: Top |
| `p20` | point | `[1,0]` | [x, y], fractions of the box (0–1) | group: Mesh; label: Top right |
| `p01` | point | `[0,0.5]` | [x, y], fractions of the box (0–1) | group: Mesh; label: Left |
| `p11` | point | `[0.5,0.5]` | [x, y], fractions of the box (0–1) | group: Mesh; label: Middle |
| `p21` | point | `[1,0.5]` | [x, y], fractions of the box (0–1) | group: Mesh; label: Right |
| `p02` | point | `[0,1]` | [x, y], fractions of the box (0–1) | group: Mesh; label: Bottom left |
| `p12` | point | `[0.5,1]` | [x, y], fractions of the box (0–1) | group: Mesh; label: Bottom |
| `p22` | point | `[1,1]` | [x, y], fractions of the box (0–1) | group: Mesh; label: Bottom right |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "envelope-1",
  "type": "envelope",
  "params": {
    "p00": [
      0,
      0
    ],
    "p10": [
      0.5,
      0
    ],
    "p20": [
      1,
      0
    ],
    "p01": [
      0,
      0.5
    ],
    "p11": [
      0.5,
      0.5
    ],
    "p21": [
      1,
      0.5
    ],
    "p02": [
      0,
      1
    ],
    "p12": [
      0.5,
      1
    ],
    "p22": [
      1,
      1
    ]
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
