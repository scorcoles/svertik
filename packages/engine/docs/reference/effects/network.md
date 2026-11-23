# Network

`type: "network"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Utils**.

Draws elastic links between each shape and its nearest neighbours while leaving the source shapes in place. Links stay attached under Explosion, Gravity and Physics, sag with slack, and break when stretched past their resistance. Neighbour count, distance and link width are adjustable; links inherit the source colour, which Color or Tint can change after Network.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `neighbors` | number | `2` | min 1, max 8, step 1 |  |
| `maxDistance` | number | `180` | min 0, max 1200, step 5 | unit: px; label: Max distance |
| `gap` | number | `2` | min 0, max 100, step 0.5 | unit: px; label: Edge gap |
| `elasticity` | number | `0.35` | min 0, max 1, step 0.01 |  |
| `resistance` | number | `3` | min 1, max 8, step 0.1 |  |
| `width` | number | `1.5` | min 0.1, max 24, step 0.1 | unit: px; label: Link width |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "network-1",
  "type": "network",
  "params": {
    "neighbors": 2,
    "maxDistance": 180,
    "gap": 2,
    "elasticity": 0.35,
    "resistance": 3,
    "width": 1.5
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
