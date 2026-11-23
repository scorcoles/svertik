# Wave

`type: "wave"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

Makes the drawing wavy: moves each point across the direction of the wave.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `amplitude` | number | `0.05` | min 0, max 0.5, step 0.005 | fraction of the drawing size |
| `wavelength` | number | `0.5` | min 0.01, max 2, step 0.01 | fraction of the drawing size |
| `phase` | angle | `0` | degrees |  |
| `direction` | angle | `0` | degrees |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "wave-1",
  "type": "wave",
  "params": {
    "amplitude": 0.05,
    "wavelength": 0.5,
    "phase": 0,
    "direction": 0
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
