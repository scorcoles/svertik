# Wave Lines

`type: "wavelines"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Draw**.

Turns sampled tone into horizontal vector lines. Darkness shapes each line’s offset and weight; Line spacing, Sample spacing, Wave amount and Wavelength control the texture. Speed moves the wave over Time, which follows scene.time unless it is set. Lines stay within the sampled silhouette; use Color or Tint after Wave Lines to style them.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `spacing` | number | `12` | min 2, max 120, step 0.5 | unit: px; label: Line spacing |
| `resolution` | number | `6` | min 1, max 40, step 0.5 | unit: px; label: Sample spacing |
| `amplitude` | number | `22` | min 0, max 160, step 1 | unit: px; label: Wave amount |
| `wavelength` | number | `180` | min 12, max 1200, step 1 | unit: px |
| `width` | number | `1.4` | min 0.1, max 12, step 0.1 | unit: px; label: Line width |
| `weight` | number | `0.8` | min 0, max 1, step 0.01 | label: Tone weight |
| `gamma` | number | `1` | min 0.1, max 4, step 0.05 |  |
| `invert` | boolean | `false` |  |  |
| `time` | number | `0` | min 0, max 3600, step 0.01 | unit: s; left out, it follows `scene.time` |
| `speed` | number | `0.35` | min -4, max 4, step 0.01 | unit: Hz |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "wavelines-1",
  "type": "wavelines",
  "params": {
    "spacing": 12,
    "resolution": 6,
    "amplitude": 22,
    "wavelength": 180,
    "width": 1.4,
    "weight": 0.8,
    "gamma": 1,
    "invert": false,
    "time": {
      "$expr": "scene.time",
      "fallback": 0
    },
    "speed": 0.35
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
