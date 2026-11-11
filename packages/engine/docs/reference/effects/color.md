# Color

`type: "color"` · Style: changes colours or paint, not the geometry. · Editor menu: **Style**.

Colour variation per element: `shift` rotates the hue and adjusts saturation and lightness; `gradient` spreads a gradient across the elements; `random` varies them at random.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `mode` | enum | `"shift"` | `shift`, `gradient`, `random` | not animatable |
| `hue` | angle | `30` | degrees |  |
| `saturation` | number | `0` | min -1, max 1, step 0.01 |  |
| `lightness` | number | `0` | min -1, max 1, step 0.01 |  |
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
