# Color

`type: "color"` · Style: changes colours or paint, not the geometry. · Editor menu: **Style**.

Assign or vary colour per element: `solid` assigns the selected colour to fill, stroke or both; `shift` rotates the hue and adjusts saturation and lightness; `gradient` spreads a gradient across the elements; `random` varies them at random; `palette` picks one exact colour from an editable list for each element, including each Clone copy. Copies emitted by one Mouse Instance input event share a palette choice.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `mode` | enum | `"shift"` | `solid`, `shift`, `gradient`, `random`, `palette` | not animatable |
| `palette` | palette | `["#ff6b5e","#ffc857","#09fdd1","#4d8dff","#b894f6"]` | non-empty array of #rrggbb colors | not animatable; only when `mode` is `palette`; group: Palette; label: Colors |
| `paletteMode` | enum | `"random"` | `random`, `index` | not animatable; only when `mode` is `palette`; group: Palette; label: Choose |
| `index` | number | `0` | step 1 | only when `mode` is `palette` and `paletteMode` is `index`; group: Palette |
| `color` | color | `"#D2502F"` | #rrggbb | only when `mode` is `solid` |
| `hue` | angle | `30` | degrees | only when `mode` is `shift` |
| `saturation` | number | `0` | min -1, max 1, step 0.01 | only when `mode` is `shift` |
| `lightness` | number | `0` | min -1, max 1, step 0.01 | only when `mode` is `shift` |
| `from` | color | `"#09fdd1"` | #rrggbb | group: Gradient |
| `to` | color | `"#ff6b5e"` | #rrggbb | group: Gradient |
| `variation` | number | `0.3` | min 0, max 1, step 0.01 | group: Random |
| `seed` | seed | `1` | integer | group: Random |
| `target` | enum | `"fill"` | `fill`, `stroke`, `both` | not animatable |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "color-1",
  "type": "color",
  "params": {
    "mode": "shift",
    "palette": [
      "#ff6b5e",
      "#ffc857",
      "#09fdd1",
      "#4d8dff",
      "#b894f6"
    ],
    "paletteMode": "random",
    "index": 0,
    "color": "#D2502F",
    "hue": 30,
    "saturation": 0,
    "lightness": 0,
    "from": "#09fdd1",
    "to": "#ff6b5e",
    "variation": 0.3,
    "seed": 1,
    "target": "fill"
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
