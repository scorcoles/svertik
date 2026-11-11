# Look At

`type: "lookat"` · Deformer: moves the points of the drawing. · Editor menu: **Utils**.

Turns the object so that it faces another one (its center), around `pivot`. `facing` says which side is the front (0 right, -90 up, 90 down, 180 left); `amount`, how much it turns. If the other moves, it keeps looking.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `target` | node | `""` | id of another node |  |
| `facing` | angle | `0` | degrees |  |
| `amount` | number | `1` | min 0, max 1, step 0.01 |  |
| `pivot` | point | `[0.5,0.5]` | [x, y], fractions of the box (0–1) |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "lookat-1",
  "type": "lookat",
  "params": {
    "target": "",
    "facing": 0,
    "amount": 1,
    "pivot": [
      0.5,
      0.5
    ]
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
