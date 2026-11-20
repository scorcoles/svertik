# Oscillate

`type: "oscillate"` · Effector: acts per element (letters, copies, pieces…), usually through nested effects. · Editor menu: **Effect**.

Periodic modulation of nested effects: sine, triangle, square or saw. Frequency is cycles per second; amplitude and offset control signal strength. Phase and Element phase are degrees. Disable Per element to move the whole object together. Time follows scene.time when added in the editor; numeric child parameters move around their neutral values (scale around 1). Oscillate can be nested in Range or Field to limit the signal to selected elements; its Amplitude and Offset scale with that selector's weight, and its per-element phase follows original Clone indices.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `wave` | enum | `"sine"` | `sine`, `triangle`, `square`, `saw` | not animatable |
| `time` | number | `0` | step 0.01 | unit: s |
| `frequency` | number | `1` | min 0, max 20, step 0.05 | unit: Hz |
| `amplitude` | number | `1` | min 0, max 2, step 0.01 |  |
| `offset` | number | `0` | min -2, max 2, step 0.01 |  |
| `phase` | angle | `0` | degrees |  |
| `perElement` | boolean | `true` |  | not animatable; label: Per element |
| `elementPhase` | angle | `20` | degrees | only when `perElement` is `true`; label: Element phase |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "oscillate-1",
  "type": "oscillate",
  "params": {
    "wave": "sine",
    "time": 0,
    "frequency": 1,
    "amplitude": 1,
    "offset": 0,
    "phase": 0,
    "perElement": true,
    "elementPhase": 20
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
