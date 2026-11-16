# Arrow

Primitive · `shape: "arrow"`.

A continuous arrow outline with independent Start head and End head selectors: none, triangular, V, square or round. Head / length sets the head length relative to the total; Head / body width controls its width. V depth controls the chevron notch. Numeric proportions can be animated.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `length` | number | `240` | min 1, step 1 | unit: px |
| `width` | number | `24` | min 1, step 1 | unit: px; label: Body width |
| `startHead` | enum | `"none"` | `none`, `triangle`, `v`, `square`, `circle` | not animatable; label: Start head |
| `endHead` | enum | `"triangle"` | `none`, `triangle`, `v`, `square`, `circle` | not animatable; label: End head |
| `headLength` | number | `0.28` | min 0.01, max 0.5, step 0.01 | fraction of the drawing size; label: Head / length |
| `headWidth` | number | `3` | min 1, max 12, step 0.1 | label: Head / body width |
| `notch` | number | `0.45` | min 0, max 0.9, step 0.01 | fraction of the drawing size; label: V depth |
| `fill` | boolean | `true` |  | not animatable; group: Style |
| `fillColor` | color | `"#d9d9d9"` | #rrggbb | group: Style; label: Fill color |
| `stroke` | boolean | `false` |  | not animatable; group: Style |
| `strokeColor` | color | `"#ededed"` | #rrggbb | only when `stroke` is `true`; group: Style; label: Stroke color |
| `strokeWidth` | number | `2` | min 0, max 40, step 0.5 | unit: px; only when `stroke` is `true`; group: Style; label: Stroke width |
| `strokeJoin` | enum | `"round"` | `miter`, `round`, `bevel` | not animatable; only when `stroke` is `true`; group: Style; label: Join |
| `strokeCap` | enum | `"round"` | `butt`, `round`, `square` | not animatable; only when `stroke` is `true`; group: Style; label: Cap |
| `dash` | number | `0` | min 0, max 400, step 0.5 | unit: px; only when `stroke` is `true`; group: Style |
| `gap` | number | `0` | min 0, max 400, step 0.5 | unit: px; only when `stroke` is `true`; group: Style |
| `dashOffset` | number | `0` | min -10000, max 10000, step 1 | unit: px; only when `stroke` is `true`; group: Style; label: Dash offset |
| `behind` | boolean | `false` |  | not animatable; only when `stroke` is `true`; group: Style; label: Behind fill |

Parameters can be animated with a track `{ on: "shape", param: "<name>" }`.

## In a scene

```json
{
  "kind": "shape",
  "id": "arrow-1",
  "name": "Arrow",
  "shape": "arrow",
  "params": {
    "length": 240,
    "width": 24,
    "startHead": "none",
    "endHead": "triangle",
    "headLength": 0.28,
    "headWidth": 3,
    "notch": 0.45,
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
