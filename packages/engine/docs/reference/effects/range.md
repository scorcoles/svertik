# Range

`type: "range"` · Effector: acts per element (letters, copies, pieces…), usually through nested effects. · Editor menu: **Effect**.

Selects elements, text words/lines or Clone grid rows/columns for nested effects. Select: All, Even, Odd or CSS-style An+B (one-based). Start/End/Offset limit the selection; Falloff (stored as shape) controls strength, with Square applying a uniform amount. Odd grid rows are 1, 3, 5… and keep their original indices through partial grids. In Wire, only the Range selected in the stack highlights its affected elements, using a stable five-colour palette.

Takes nested effects (`children`), weighted per element by its order. It can contain the time-signal effectors Oscillate, Wiggle, Pulse and Shake; those signals act only on the selected elements. Their Amplitude and Offset follow Range's per-element weight, and Per element keeps using the original Clone index when Range selects a subset.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `selector` | enum | `"all"` | `all`, `even`, `odd`, `nth` | not animatable; label: Select |
| `nth` | text | `"2n"` |  | not animatable; only when `selector` is `nth`; label: An+B |
| `start` | number | `0` | min 0, max 1, step 0.01 |  |
| `end` | number | `1` | min 0, max 1, step 0.01 |  |
| `offset` | number | `0` | min -1, max 1, step 0.01 |  |
| `shape` | enum | `"square"` | `square`, `ramp up`, `ramp down`, `triangle`, `round`, `smooth` | not animatable; label: Falloff |
| `unit` | enum | `"elements"` | `elements`, `words`, `lines`, `rows`, `columns` | not animatable |
| `amount` | number | `1` | min 0, max 1, step 0.01 |  |
| `random` | boolean | `false` |  | not animatable; label: Random order |
| `seed` | seed | `1` | integer |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "range-1",
  "type": "range",
  "params": {
    "selector": "all",
    "nth": "2n",
    "start": 0,
    "end": 1,
    "offset": 0,
    "shape": "square",
    "unit": "elements",
    "amount": 1,
    "random": false,
    "seed": 1
  },
  "children": [
    {
      "id": "twist-1",
      "type": "twist",
      "params": {
        "angle": 30
      }
    }
  ]
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
