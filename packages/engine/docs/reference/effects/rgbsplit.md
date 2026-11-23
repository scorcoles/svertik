# RGB Split

`type: "rgbsplit"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Glitch**.

Chromatic separation with two modes: Channels (default) extracts the source RGB plates, shifting red and blue along Angle while green stays in place. Dark backgrounds use Screen; Light uses complementary CMY plates with Multiply. Solid colours, gradients and paint alpha are preserved. Duo keeps the original two-colour copies with Color A/B, Layer, Blend and Original. Nested effects apply only to the shifted plates, including independent filters; in Duo they apply to the two copies.

Takes nested effects (`children`): they apply only to the coloured copies. Anything but another RGB Split.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `mode` | enum | `"channels"` | `channels`, `duo` | not animatable |
| `distance` | number | `3` | min 0, max 60, step 0.5 | unit: px |
| `angle` | angle | `0` | degrees |  |
| `background` | enum | `"dark"` | `dark`, `light` | not animatable; only when `mode` is `channels` |
| `colorA` | color | `"#00e5ff"` | #rrggbb | only when `mode` is `duo`; label: Color A |
| `colorB` | color | `"#ff2bd6"` | #rrggbb | only when `mode` is `duo`; label: Color B |
| `layer` | enum | `"behind"` | `behind`, `front` | not animatable; only when `mode` is `duo` |
| `blend` | enum | `"normal"` | `normal`, `multiply`, `screen`, `overlay`, `darken`, `lighten`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`, `exclusion`, `hue`, `saturation`, `color`, `luminosity` | not animatable; only when `mode` is `duo` |
| `original` | boolean | `true` |  | only when `mode` is `duo` |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "rgbsplit-1",
  "type": "rgbsplit",
  "params": {
    "mode": "channels",
    "distance": 3,
    "angle": 0,
    "background": "dark",
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
