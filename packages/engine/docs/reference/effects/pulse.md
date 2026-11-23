# Pulse

`type: "pulse"` · Effector: acts per element (letters, copies, pieces…), usually through nested effects. · Editor menu: **Effect**.

Repeated pulses of nested effects, from neutral to full strength and back. Attack and Decay are fractions of one cycle; any remaining time is rest. If their sum exceeds 1 they are fitted to one cycle. Frequency, amplitude, offset and per-element phase work as in Oscillate. Time follows scene.time unless it is set.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `time` | number | `0` | step 0.01 | unit: s; left out, it follows `scene.time` |
| `frequency` | number | `1` | min 0, max 20, step 0.05 | unit: Hz |
| `amplitude` | number | `1` | min 0, max 2, step 0.01 |  |
| `offset` | number | `0` | min -2, max 2, step 0.01 |  |
| `phase` | angle | `0` | degrees |  |
| `perElement` | boolean | `true` |  | not animatable; label: Per element |
| `elementPhase` | angle | `20` | degrees | only when `perElement` is `true`; label: Element phase |
| `attack` | number | `0.1` | min 0, max 1, step 0.01 | fraction of the drawing size; label: Attack / cycle |
| `decay` | number | `0.4` | min 0, max 1, step 0.01 | fraction of the drawing size; label: Decay / cycle |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "pulse-1",
  "type": "pulse",
  "params": {
    "time": {
      "$expr": "scene.time",
      "fallback": 0
    },
    "frequency": 1,
    "amplitude": 1,
    "offset": 0,
    "phase": 0,
    "perElement": true,
    "elementPhase": 20,
    "attack": 0.1,
    "decay": 0.4
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
