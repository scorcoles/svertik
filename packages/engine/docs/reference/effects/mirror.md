# Mirror

`type: "mirror"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Generate**.

Reflects the drawing on an axis at a fraction of its box. `keep` keeps the original and adds the reflection (symmetry); `transform` replaces it with its reflection.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `axis` | enum | `"horizontal"` | `horizontal`, `vertical` | not animatable |
| `position` | number | `1` | min -1, max 2, step 0.01 | fraction of the drawing size; label: Axis at |
| `original` | enum | `"keep"` | `keep`, `transform` | not animatable |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "mirror-1",
  "type": "mirror",
  "params": {
    "axis": "horizontal",
    "position": 1,
    "original": "keep"
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
