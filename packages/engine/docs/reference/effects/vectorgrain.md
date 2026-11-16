# Vector Grain

`type: "vectorgrain"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Generate**.

Vector stipple that gathers at the edges, as real marks (not the SVG Grain filter). Density is highest at the edge and falls off over Falloff px, shaped by Curve, down to Interior deep inside. Edge: inside the shape, outside (a halo) or both. Marks are circles, squares or irregular specks; Size, Size jitter and Edge size control them, Color takes the shape fill or an ink, Opacity and Opacity jitter vary them, Distribution is random or even, and Source keeps or replaces the drawing. Seeded.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `edge` | enum | `"inside"` | `inside`, `outside`, `both` | not animatable |
| `density` | number | `2000` | min 0, max 5000, step 10 |  |
| `falloff` | number | `40` | min 0.5, max 2000, step 0.5 | unit: px |
| `curve` | number | `1.5` | min 0.1, max 6, step 0.05 |  |
| `interior` | number | `0` | min 0, max 1, step 0.01 |  |
| `center` | point | `[0.5,0.5]` | [x, y], fractions of the box (0–1) |  |
| `focus` | number | `1` | min 0, max 1, step 0.01 |  |
| `focusCurve` | number | `1` | min 0.1, max 6, step 0.05 | label: Focus curve |
| `distribution` | enum | `"random"` | `random`, `even` | not animatable |
| `shape` | enum | `"circle"` | `circle`, `square`, `speck` | not animatable; label: Mark |
| `size` | number | `1.2` | min 0.05, max 50, step 0.05 | unit: px |
| `sizeJitter` | number | `0.5` | min 0, max 1, step 0.01 | label: Size jitter |
| `edgeSize` | number | `1` | min 0.1, max 4, step 0.05 | label: Edge size |
| `color` | enum | `"ink"` | `ink`, `original` | not animatable |
| `ink` | color | `"#000000"` | #rrggbb | only when `color` is `ink` |
| `blend` | enum | `"normal"` | `normal`, `multiply`, `screen`, `overlay`, `darken`, `lighten`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`, `exclusion`, `hue`, `saturation`, `color`, `luminosity` | not animatable |
| `opacity` | number | `1` | min 0, max 1, step 0.01 |  |
| `opacityJitter` | number | `0` | min 0, max 1, step 0.01 | label: Opacity jitter |
| `source` | enum | `"keep"` | `keep`, `replace` | not animatable |
| `seed` | seed | `1` | integer |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "vectorgrain-1",
  "type": "vectorgrain",
  "params": {
    "edge": "inside",
    "density": 2000,
    "falloff": 40,
    "curve": 1.5,
    "interior": 0,
    "center": [
      0.5,
      0.5
    ],
    "focus": 1,
    "focusCurve": 1,
    "distribution": "random",
    "shape": "circle",
    "size": 1.2,
    "sizeJitter": 0.5,
    "edgeSize": 1,
    "color": "ink",
    "ink": "#000000",
    "blend": "normal",
    "opacity": 1,
    "opacityJitter": 0,
    "source": "keep",
    "seed": 1
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
