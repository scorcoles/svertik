# Grain

`type: "grain"` · SVG filter: does not change the geometry; the browser applies it to the whole object after the rest of its stack. · Editor menu: **Filters**.

Fine noise over the drawing (only inside it), like film or print grain.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `amount` | number | `0.35` | min 0, max 1, step 0.01 |  |
| `size` | number | `1` | min 0.25, max 10, step 0.05 | unit: px |
| `seed` | seed | `1` | integer |  |
| `area` | enum | `"all"` | `all`, `radial`, `band` | not animatable; group: Area |
| `center` | point | `[0.5,0.5]` | [x, y], fractions of the box (0–1) | only when `area` is `radial` or `band`; group: Area |
| `radius` | number | `0.3` | min 0, max 2, step 0.01 | fraction of the drawing size; only when `area` is `radial` or `band`; group: Area |
| `falloff` | number | `0.5` | min 0, max 1, step 0.01 | only when `area` is `radial` or `band`; group: Area |
| `angle` | angle | `0` | degrees | only when `area` is `band`; group: Area |
| `invert` | boolean | `false` |  | only when `area` is `radial` or `band`; group: Area |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "grain-1",
  "type": "grain",
  "params": {
    "amount": 0.35,
    "size": 1,
    "seed": 1,
    "area": "all",
    "center": [
      0.5,
      0.5
    ],
    "radius": 0.3,
    "falloff": 0.5,
    "angle": 0,
    "invert": false
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
