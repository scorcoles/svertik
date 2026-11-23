# Path

Primitive · `shape: "path"`.

An editable source path with open or closed cubic Bézier contours. Anchors have independent, smooth or symmetric handles. Coordinates stay in local pixels, so moving points preserves the source origin and the procedural effect stack.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `contours` | path | `[{"closed":false,"points":[{"point":[-100,50],"in":[0,0],"out":[0,0],"mode":"corner"},{"point":[0,-50],"in":[-40,0],"out":[40,0],"mode":"symmetric"},{"point":[100,50],"in":[0,0],"out":[0,0],"mode":"corner"}]}]` |  | not animatable |
| `fill` | boolean | `true` |  | not animatable; group: Style |
| `fillColor` | color | `"#d9d9d9"` | #rrggbb | group: Style; label: Fill color |
| `stroke` | boolean | `false` |  | not animatable; group: Style |
| `strokeColor` | color | `"#ededed"` | #rrggbb | only when `stroke` is `true`; group: Style; label: Stroke color |
| `strokeWidth` | number | `2` | min 0, max 400, step 0.5 | unit: px; only when `stroke` is `true`; group: Style; label: Stroke width |
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
  "id": "path-1",
  "name": "Path",
  "shape": "path",
  "params": {
    "contours": [
      {
        "closed": false,
        "points": [
          {
            "point": [
              -100,
              50
            ],
            "in": [
              0,
              0
            ],
            "out": [
              0,
              0
            ],
            "mode": "corner"
          },
          {
            "point": [
              0,
              -50
            ],
            "in": [
              -40,
              0
            ],
            "out": [
              40,
              0
            ],
            "mode": "symmetric"
          },
          {
            "point": [
              100,
              50
            ],
            "in": [
              0,
              0
            ],
            "out": [
              0,
              0
            ],
            "mode": "corner"
          }
        ]
      }
    ],
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
