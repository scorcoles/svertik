# Star

Primitive · `shape: "star"`.

A star with any number of points and an inner radius (2 points make a needle or a diamond).

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `radius` | number | `80` | min 1, step 1 | unit: px |
| `points` | number | `5` | min 2, max 64, step 1 |  |
| `inner` | number | `0.45` | min 0.01, max 1, step 0.01 | label: Inner radius |
| `rotation` | angle | `0` | degrees |  |
| `fill` | boolean | `true` |  | not animatable; group: Style |
| `fillColor` | color | `"#d9d9d9"` | #rrggbb | group: Style; label: Fill color |
| `stroke` | boolean | `false` |  | not animatable; group: Style |
| `strokeColor` | color | `"#ededed"` | #rrggbb | group: Style; label: Stroke color |
| `strokeWidth` | number | `2` | min 0, max 40, step 0.5 | unit: px; group: Style; label: Stroke width |
| `strokeJoin` | enum | `"round"` | `miter`, `round`, `bevel` | not animatable; group: Style; label: Join |
| `strokeCap` | enum | `"round"` | `butt`, `round`, `square` | not animatable; group: Style; label: Cap |
| `dash` | number | `0` | min 0, max 400, step 0.5 | unit: px; only when `stroke` is `true`; group: Style |
| `gap` | number | `0` | min 0, max 400, step 0.5 | unit: px; only when `stroke` is `true`; group: Style |
| `dashOffset` | number | `0` | min -10000, max 10000, step 1 | unit: px; only when `stroke` is `true`; group: Style; label: Dash offset |
| `behind` | boolean | `false` |  | not animatable; only when `stroke` is `true`; group: Style; label: Behind fill |

Parameters can be animated with a track `{ on: "shape", param: "<name>" }`.

## In a scene

```json
{
  "kind": "shape",
  "id": "star-1",
  "name": "Star",
  "shape": "star",
  "params": {
    "radius": 80,
    "points": 5,
    "inner": 0.45,
    "rotation": 0,
    "fill": true,
    "fillColor": "#d9d9d9",
    "stroke": false,
    "strokeColor": "#ededed",
    "strokeWidth": 2,
    "strokeJoin": "round",
    "strokeCap": "round",
    "dash": 0,
    "gap": 0,
    "dashOffset": 0,
    "behind": false
  },
  "stack": [],
  "transform": {
    "x": 0,
    "y": 0
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
