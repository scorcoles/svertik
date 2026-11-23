# Blur

`type: "blur"` · SVG filter: does not change the geometry; the browser applies it to the whole object after the rest of its stack. · Editor menu: **Filters**.

Blur in both directions or only one (motion blur), on the whole drawing or only in an area.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `amount` | number | `4` | min 0, max 100, step 0.5 | unit: px |
| `direction` | enum | `"both"` | `both`, `horizontal`, `vertical` | not animatable |
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
  "id": "blur-1",
  "type": "blur",
  "params": {
    "amount": 4,
    "direction": "both",
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
