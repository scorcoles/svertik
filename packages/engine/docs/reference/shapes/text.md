# Text

Primitive · `shape: "text"`.

Text turned into outlines, one piece per letter (so Step, Stagger and Range can treat letters, words and lines separately). Uses the registered fonts.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `text` | text | `"svertik"` |  |  |
| `font` | font | `"JetBrains Mono"` |  |  |
| `weight` | number | `400` | min 100, max 900, step 100 | not animatable |
| `italic` | boolean | `false` |  | not animatable |
| `size` | number | `72` | min 1, step 1 | unit: px |
| `tracking` | number | `0` | min -500, max 2000, step 5 |  |
| `lineHeight` | number | `1.2` | min 0.5, max 4, step 0.05 | label: Line height |
| `align` | enum | `"center"` | `left`, `center`, `right` | not animatable |
| `anchor` | enum | `"ink"` | `ink`, `left`, `center`, `right` | not animatable |
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
  "id": "text-1",
  "name": "Text",
  "shape": "text",
  "params": {
    "text": "svertik",
    "font": "JetBrains Mono",
    "weight": 400,
    "italic": false,
    "size": 72,
    "tracking": 0,
    "lineHeight": 1.2,
    "align": "center",
    "anchor": "ink",
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
