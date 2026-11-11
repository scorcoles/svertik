# Bevel

`type: "bevel"` · SVG filter: does not change the geometry; the browser applies it to the whole object after the rest of its stack. · Editor menu: **Filters**.

Relief: light and shade on the edges, as if the drawing had volume. The light comes from `angle` at `elevation`; `depth` is the bevel width, `height` how much it stands out, `shine` the highlight.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `depth` | number | `4` | min 0.5, max 60, step 0.5 | unit: px |
| `height` | number | `3` | min 0, max 20, step 0.1 |  |
| `angle` | angle | `-135` | degrees | label: Light |
| `elevation` | number | `45` | min 5, max 85, step 1 | unit: ° |
| `strength` | number | `0.8` | min 0, max 1, step 0.01 |  |
| `shine` | number | `0.5` | min 0, max 2, step 0.01 |  |
| `shininess` | number | `20` | min 1, max 128, step 1 |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "bevel-1",
  "type": "bevel",
  "params": {
    "depth": 4,
    "height": 3,
    "angle": -135,
    "elevation": 45,
    "strength": 0.8,
    "shine": 0.5,
    "shininess": 20
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
