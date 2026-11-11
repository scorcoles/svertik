# Scanlines

`type: "scanlines"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Glitch**.

Glitch: scan lines across the drawing, clipped to it.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `count` | number | `60` | min 1, max 300, step 1 |  |
| `width` | number | `0.75` | min 0.1, max 6, step 0.05 | unit: px |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "scanlines-1",
  "type": "scanlines",
  "params": {
    "count": 60,
    "width": 0.75
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
