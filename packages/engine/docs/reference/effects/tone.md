# Tone

`type: "tone"` · SVG filter: does not change the geometry; the browser applies it to the whole object after the rest of its stack. · Editor menu: **Filters**.

Tone: posterize (few levels per channel, like a poster), duotone (shadows in one colour and lights in another) or invert the colours. On the whole drawing or only in an area.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `mode` | enum | `"posterize"` | `posterize`, `duotone`, `invert` | not animatable |
| `levels` | number | `4` | min 2, max 16, step 1 | only when `mode` is `posterize` |
| `dark` | color | `"#1b1464"` | #rrggbb | only when `mode` is `duotone`; label: Shadows |
| `light` | color | `"#ff4fa3"` | #rrggbb | only when `mode` is `duotone`; label: Lights |
| `area` | enum | `"all"` | `all`, `radial`, `band` | not animatable; group: Area |
| `center` | point | `[0.5,0.5]` | [x, y], fractions of the box (0–1) | only when `area` is `radial` or `band`; group: Area |
| `radius` | number | `0.3` | min 0, max 2, step 0.01 | fraction of the drawing size; only when `area` is `radial` or `band`; group: Area |
| `falloff` | number | `0.5` | min 0, max 1, step 0.01 | only when `area` is `radial` or `band`; group: Area |
| `angle` | angle | `0` | degrees | only when `area` is `band`; group: Area |
| `invert` | boolean | `false` |  | only when `area` is `radial` or `band`; group: Area |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "tone-1",
  "type": "tone",
  "params": {
    "mode": "posterize",
    "levels": 4,
    "dark": "#1b1464",
    "light": "#ff4fa3",
    "area": "all",
    "center": [
      0.5,
      0.5
    ],
    "radius": 0.3,
    "falloff": 0.5,
    "angle": 0,
    "invert": false
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
