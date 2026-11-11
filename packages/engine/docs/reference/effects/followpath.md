# Follow Path

`type: "followpath"` · Deformer: moves the points of the drawing. · Editor menu: **Utils**.

Moves the whole object, without bending it, to a point on another object's path: `position` is the fraction of the way (0 start, 1 end; closed paths loop). `anchor` is the point of the object that sits on the path; `orient` turns it with the path.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `target` | node | `""` | id of another node | label: Path |
| `position` | number | `0` | min 0, max 1, step 0.001 |  |
| `orient` | boolean | `true` |  |  |
| `angle` | angle | `0` | degrees |  |
| `offset` | number | `0` | min -500, max 500, step 0.5 | unit: px |
| `anchor` | point | `[0.5,0.5]` | [x, y], fractions of the box (0–1) |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "followpath-1",
  "type": "followpath",
  "params": {
    "target": "",
    "position": 0,
    "orient": true,
    "angle": 0,
    "offset": 0,
    "anchor": [
      0.5,
      0.5
    ]
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
