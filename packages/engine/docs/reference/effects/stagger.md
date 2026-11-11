# Stagger

`type: "stagger"` · Effector: acts per element (letters, copies, pieces…), usually through nested effects. · Editor menu: **Effect**.

Each element makes its own transition, with its curve, a little after the previous one. Progress (0–1) is the whole animation: animate it with two keys. `in` brings elements in, `out` takes them away.

Takes nested effects (`children`): each element goes from them to its rest (in) or the other way (out), one after another. Nested effectors are not allowed.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `progress` | number | `1` | min 0, max 1, step 0.01 |  |
| `direction` | enum | `"in"` | `in`, `out` | not animatable |
| `stagger` | number | `0.5` | min 0, max 1, step 0.01 |  |
| `ease` | enum | `"ease-out"` | `linear`, `ease-in`, `ease-out`, `ease-in-out`, `expo-in`, `expo-out`, `back-in`, `back-out`, `elastic-in`, `elastic-out`, `bounce-in`, `bounce-out` | not animatable |
| `order` | enum | `"forward"` | `forward`, `reverse`, `center`, `edges`, `random` | not animatable |
| `unit` | enum | `"elements"` | `elements`, `words`, `lines` | not animatable |
| `seed` | seed | `1` | integer |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "stagger-1",
  "type": "stagger",
  "params": {
    "progress": 1,
    "direction": "in",
    "stagger": 0.5,
    "ease": "ease-out",
    "order": "forward",
    "unit": "elements",
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
