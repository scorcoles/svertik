# Round Corners

`type: "roundcorners"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

Rounds the corners: wherever the path changes direction sharply, it cuts both segments and joins them with an arc of `radius` px (or a straight cut, `chamfer`). Smooth curves are left alone; `limit` keeps corners wider than that angle. Set Corners to Random to choose a stable seeded subset independently for each clone.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `radius` | number | `12` | min 0, max 500, step 0.5 | unit: px |
| `limit` | number | `180` | min 0, max 180, step 1 | unit: °; label: Angle limit |
| `shape` | enum | `"round"` | `round`, `chamfer` | not animatable |
| `corners` | enum | `"all"` | `all`, `random` | not animatable |
| `seed` | seed | `1` | integer |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "roundcorners-1",
  "type": "roundcorners",
  "params": {
    "radius": 12,
    "limit": 180,
    "shape": "round",
    "corners": "all",
    "seed": 1
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
