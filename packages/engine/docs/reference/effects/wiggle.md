# Wiggle

`type: "wiggle"` · Effector: acts per element (letters, copies, pieces…), usually through nested effects. · Editor menu: **Effect**.

Smooth seeded random modulation of nested effects. Frequency controls the rate of change, amplitude its strength, offset its centre. Per element gives each clone or glyph an independent reproducible signal. Time follows scene.time in the editor; seeking backwards gives the same result.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `time` | number | `0` | step 0.01 | unit: s |
| `frequency` | number | `1` | min 0, max 20, step 0.05 | unit: Hz |
| `amplitude` | number | `1` | min 0, max 2, step 0.01 |  |
| `offset` | number | `0` | min -2, max 2, step 0.01 |  |
| `phase` | angle | `0` | degrees |  |
| `perElement` | boolean | `true` |  | not animatable; label: Per element |
| `elementPhase` | angle | `20` | degrees | only when `perElement` is `true`; label: Element phase |
| `seed` | seed | `1` | integer |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "wiggle-1",
  "type": "wiggle",
  "params": {
    "time": 0,
    "frequency": 1,
    "amplitude": 1,
    "offset": 0,
    "phase": 0,
    "perElement": true,
    "elementPhase": 20,
    "seed": 1
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
