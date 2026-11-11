# Explosion

`type: "explosion"` · Effector: acts per element (letters, copies, pieces…), usually through nested effects. · Editor menu: **Effect**.

Each element (a piece of Damage or Crack, a Mosaic tile, a Clone copy, a letter…) flies away from a centre: it moves out, spins and shrinks a little, each in its own way. `amount` from 0 to 1 plays the explosion.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `amount` | number | `0.5` | min 0, max 1, step 0.01 |  |
| `force` | number | `0.5` | min 0, max 3, step 0.01 | fraction of the drawing size |
| `spin` | angle | `90` | degrees |  |
| `shrink` | number | `0.3` | min 0, max 1, step 0.01 |  |
| `chaos` | number | `0.5` | min 0, max 1, step 0.01 |  |
| `center` | point | `[0.5,0.5]` | [x, y], fractions of the box (0–1) |  |
| `seed` | seed | `1` | integer |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "explosion-1",
  "type": "explosion",
  "params": {
    "amount": 0.5,
    "force": 0.5,
    "spin": 90,
    "shrink": 0.3,
    "chaos": 0.5,
    "center": [
      0.5,
      0.5
    ],
    "seed": 1
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
