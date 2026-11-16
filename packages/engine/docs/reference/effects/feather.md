# Feather

`type: "feather"` · Style: changes colours or paint, not the geometry. · Editor menu: **Style**.

Softens a solid fill with a radial fade and slightly expands the shape to preserve its opaque centre. Uses a native SVG gradient instead of a raster blur filter, so it is lighter for many small copies.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `softness` | number | `0.2` | min 0, max 0.6, step 0.01 | fraction of the drawing size |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "feather-1",
  "type": "feather",
  "params": {
    "softness": 0.2
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
