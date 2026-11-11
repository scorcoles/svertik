# Gradient

`type: "gradient"` · Style: changes colours or paint, not the geometry. · Editor menu: **Style**.

A gradient on the fill or the stroke of each shape: linear (with an angle) or radial (centre, radius and focus), with an optional middle colour (`via`). Relative to each shape's box, so it follows the shape.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `kind` | enum | `"linear"` | `linear`, `radial` | not animatable |
| `from` | color | `"#09fdd1"` | #rrggbb |  |
| `to` | color | `"#5c3cff"` | #rrggbb |  |
| `fromOpacity` | number | `1` | min 0, max 1, step 0.01 | label: From opacity |
| `toOpacity` | number | `1` | min 0, max 1, step 0.01 | label: To opacity |
| `via` | boolean | `false` |  | not animatable |
| `viaColor` | color | `"#ffffff"` | #rrggbb | label: Via color |
| `midpoint` | number | `0.5` | min 0.05, max 0.95, step 0.01 |  |
| `angle` | angle | `90` | degrees | group: Linear |
| `center` | point | `[0.5,0.5]` | [x, y], fractions of the box (0–1) | group: Radial |
| `radius` | number | `0.5` | min 0.05, max 2, step 0.01 | fraction of the drawing size; group: Radial |
| `focus` | point | `[0.5,0.5]` | [x, y], fractions of the box (0–1) | group: Radial |
| `apply` | enum | `"fill"` | `fill`, `stroke` | not animatable; label: Apply to |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "gradient-1",
  "type": "gradient",
  "params": {
    "kind": "linear",
    "from": "#09fdd1",
    "to": "#5c3cff",
    "fromOpacity": 1,
    "toOpacity": 1,
    "via": false,
    "viaColor": "#ffffff",
    "midpoint": 0.5,
    "angle": 90,
    "center": [
      0.5,
      0.5
    ],
    "radius": 0.5,
    "focus": [
      0.5,
      0.5
    ],
    "apply": "fill"
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
