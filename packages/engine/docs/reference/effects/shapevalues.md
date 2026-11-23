# Shape

`type: "shapevalues"` · Deformer: moves the points of the drawing. · Editor menu: **Effect**.

Only inside Each, on a shape object after a Clone: rebuilds every copy with other values for the shape's own parameters, by name, usually formulas with element.* (Inner = 19 * (1 - element.distance) closes the holes of a donut grid towards the edges). The new copy keeps its place and style.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |

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
