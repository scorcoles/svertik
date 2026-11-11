# RGB Split

`type: "rgbsplit"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Glitch**.

RGB split: two coloured copies of the drawing shifted to each side (Distance, along Angle). Geometry, not a filter: inside Step, Range or Field each element gets its own distance, and it exports to Lottie. Effects nested inside it apply only to the copies.

Takes nested effects (`children`): they apply only to the coloured copies. Anything but another RGB Split.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `distance` | number | `3` | min 0, max 60, step 0.5 | unit: px |
| `angle` | angle | `0` | degrees |  |
| `colorA` | color | `"#00e5ff"` | #rrggbb | label: Color A |
| `colorB` | color | `"#ff2bd6"` | #rrggbb | label: Color B |
| `layer` | enum | `"behind"` | `behind`, `front` | not animatable |
| `blend` | enum | `"normal"` | `normal`, `multiply`, `screen`, `overlay`, `darken`, `lighten`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`, `exclusion`, `hue`, `saturation`, `color`, `luminosity` | not animatable |
| `original` | boolean | `true` |  |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "rgbsplit-1",
  "type": "rgbsplit",
  "params": {
    "distance": 3,
    "angle": 0,
    "colorA": "#00e5ff",
    "colorB": "#ff2bd6",
    "layer": "behind",
    "blend": "normal",
    "original": true
  },
  "children": [
    {
      "id": "twist-1",
      "type": "twist",
      "params": {
        "angle": 30
      }
    }
  ]
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
