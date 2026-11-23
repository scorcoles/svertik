# Boolean

`type: "boolean"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Generate**.

Boolean operations between elements (a group's children, a Clone's copies…): union, subtract (the front ones cut the back one), intersect or exclude. Curves are approximated with straight segments.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `mode` | enum | `"union"` | `union`, `subtract`, `intersect`, `exclude` | not animatable |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "boolean-1",
  "type": "boolean",
  "params": {
    "mode": "union"
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
