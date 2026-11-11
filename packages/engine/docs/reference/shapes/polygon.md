# Polygon

Primitive · `shape: "polygon"`.

A regular polygon with any number of sides.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `radius` | number | `80` | min 1, step 1 | unit: px |
| `sides` | number | `6` | min 3, max 64, step 1 |  |
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
  "id": "polygon-1",
  "name": "Polygon",
  "shape": "polygon",
  "params": {
    "radius": 80,
    "sides": 6,
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
