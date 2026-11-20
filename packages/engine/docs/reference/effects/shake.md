# Shake

`type: "shake"` · Effector: acts per element (letters, copies, pieces…), usually through nested effects. · Editor menu: **Effect**.

A seeded one-shot impact that loses strength and returns exactly to neutral at Duration. Start schedules the hit; Frequency sets its vibration rate and Decay how quickly it settles. Per element adds independent signals and an Element delay. The default Transform child shakes position and rotation; seeking is deterministic. Shake can be nested in Range or Field to limit it to selected elements; Amplitude follows the selector's weight, and per-element delay keeps the original Clone indices.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `time` | number | `0` | step 0.01 | unit: s |
| `start` | number | `0` | step 0.01 | unit: s |
| `duration` | number | `1` | min 0.01, max 10, step 0.01 | unit: s |
| `frequency` | number | `8` | min 0, max 20, step 0.05 | unit: Hz |
| `amplitude` | number | `1` | min 0, max 2, step 0.01 |  |
| `decay` | number | `2` | min 0.1, max 8, step 0.1 |  |
| `perElement` | boolean | `false` |  | not animatable; label: Per element |
| `elementDelay` | number | `0.04` | min 0, max 1, step 0.01 | unit: s; only when `perElement` is `true`; label: Element delay |
| `seed` | seed | `1` | integer |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "shake-1",
  "type": "shake",
  "params": {
    "time": 0,
    "start": 0,
    "duration": 1,
    "frequency": 8,
    "amplitude": 1,
    "decay": 2,
    "perElement": false,
    "elementDelay": 0.04,
    "seed": 1
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
