# Step

`type: "step"` · Effector: acts per element (letters, copies, pieces…), usually through nested effects. · Editor menu: **Effect**.

Incremental effector: applies the modifiers nested in it to each element separately, with their numbers multiplied by the element's position. A 10° Twist under Step turns the first copy 10°, the second 20°…

Takes nested effects (`children`): applies them to each element with their numbers multiplied by the element position. Nested effectors (Step, Stagger, Range, Field) are not allowed.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `strength` | number | `1` | min 0, max 2, step 0.01 |  |
| `reverse` | boolean | `false` |  | not animatable |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "step-1",
  "type": "step",
  "params": {
    "strength": 1,
    "reverse": false
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
