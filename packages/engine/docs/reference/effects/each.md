# Each

`type: "each"` · Effector: acts per element (letters, copies, pieces…), usually through nested effects. · Editor menu: **Effect**.

Applies the effects nested in it to every element separately (Clone copies, letters, tiles…), with formulas that read the element: element.index, element.count, element.row and element.column (grid), element.u and element.v (0–1 across the grid), element.distance (0 at the centre of the elements, 1 for the furthest) and element.random (a fixed 0–1 number per element; Random seed varies it). For example, Each › Transform with scale = 1 - element.distance. A Shape inside it rebuilds each copy with other values for the shape's own parameters.

Takes nested effects (`children`): applies them to each element separately, evaluating their formulas with `element.*` for that element. A `shapevalues` (Shape) child rebuilds each copy of a shape object with other values for its own parameters. Nested effectors are not allowed.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `seed` | seed | `1` | integer | label: Random seed |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "each-1",
  "type": "each",
  "params": {
    "seed": 1
  },
  "children": [
    {
      "id": "twist-1",
      "type": "twist",
      "params": {
        "angle": {
          "$expr": "90 * element.u",
          "fallback": 30
        }
      }
    },
    {
      "id": "shapevalues-1",
      "type": "shapevalues",
      "params": {
        "inner": {
          "$expr": "0.2 + 0.6 * element.distance",
          "fallback": 0.45
        }
      }
    }
  ]
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
