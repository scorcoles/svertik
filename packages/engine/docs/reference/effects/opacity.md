# Opacity

`type: "opacity"` · Style: changes colours or paint, not the geometry. · Editor menu: **Style**.

Makes the drawing transparent. With Range or Field, letters or pieces that appear or fade away.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `opacity` | number | `0` | min 0, max 1, step 0.01 |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "opacity-1",
  "type": "opacity",
  "params": {
    "opacity": 0
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
