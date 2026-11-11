# Paint

`type: "paint"` · Style: changes colours or paint, not the geometry. · Editor menu: **Style**.

Fill and stroke: lays a colour over the fill (amount 1 replaces it) and adds or changes the stroke: width, opacity, joins, caps, dashes and paint order.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `fill` | boolean | `true` |  | not animatable; group: Fill |
| `fillColor` | color | `"#09fdd1"` | #rrggbb | group: Fill; label: Color |
| `fillAmount` | number | `1` | min 0, max 1, step 0.01 | group: Fill; label: Amount |
| `fillOpacity` | number | `1` | min 0, max 1, step 0.01 | group: Fill; label: Opacity |
| `fillEmpty` | boolean | `false` |  | not animatable; group: Fill; label: Fill empty |
| `stroke` | boolean | `false` |  | not animatable; group: Stroke |
| `strokeColor` | color | `"#000000"` | #rrggbb | group: Stroke; label: Color |
| `strokeWidth` | number | `1` | min 0, max 20, step 0.1 | unit: px; group: Stroke; label: Width |
| `strokeOpacity` | number | `1` | min 0, max 1, step 0.01 | group: Stroke; label: Opacity |
| `strokeJoin` | enum | `"keep"` | `keep`, `miter`, `round`, `bevel` | not animatable; group: Stroke; label: Join |
| `strokeCap` | enum | `"keep"` | `keep`, `butt`, `round`, `square` | not animatable; group: Stroke; label: Cap |
| `dash` | number | `0` | min 0, max 400, step 0.5 | unit: px; only when `stroke` is `true`; group: Stroke |
| `gap` | number | `0` | min 0, max 400, step 0.5 | unit: px; only when `stroke` is `true`; group: Stroke |
| `dashOffset` | number | `0` | min -10000, max 10000, step 1 | unit: px; only when `stroke` is `true`; group: Stroke; label: Dash offset |
| `behind` | boolean | `false` |  | not animatable; only when `stroke` is `true`; group: Stroke; label: Behind fill |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "paint-1",
  "type": "paint",
  "params": {
    "fill": true,
    "fillColor": "#09fdd1",
    "fillAmount": 1,
    "fillOpacity": 1,
    "fillEmpty": false,
    "stroke": false,
    "strokeColor": "#000000",
    "strokeWidth": 1,
    "strokeOpacity": 1,
    "strokeJoin": "keep",
    "strokeCap": "keep",
    "dash": 0,
    "gap": 0,
    "dashOffset": 0,
    "behind": false
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
