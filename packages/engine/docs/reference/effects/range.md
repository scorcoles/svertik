# Range

`type: "range"` · Effector: acts per element (letters, copies, pieces…), usually through nested effects. · Editor menu: **Effect**.

Range selector: picks which elements (letters, words, lines, copies, tiles…) get the nested effects, and how much, by their order. Start and End mark the range, Offset moves it: animate Offset to sweep through a text.

Takes nested effects (`children`), weighted per element by its order. Nested effectors are not allowed.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `start` | number | `0` | min 0, max 1, step 0.01 |  |
| `end` | number | `1` | min 0, max 1, step 0.01 |  |
| `offset` | number | `0` | min -1, max 1, step 0.01 |  |
| `shape` | enum | `"square"` | `square`, `ramp up`, `ramp down`, `triangle`, `round`, `smooth` | not animatable |
| `unit` | enum | `"elements"` | `elements`, `words`, `lines` | not animatable |
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
