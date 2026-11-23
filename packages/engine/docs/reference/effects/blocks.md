# Blocks

`type: "blocks"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Glitch**.

Glitch: rectangular blocks cut out and shown displaced, leaving their gap.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `count` | number | `8` | min 1, max 80, step 1 |  |
| `size` | number | `0.07` | min 0.01, max 0.4, step 0.005 | fraction of the drawing size |
| `shift` | number | `0.05` | min 0, max 0.4, step 0.005 | fraction of the drawing size |
| `seed` | seed | `1` | integer |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "blocks-1",
  "type": "blocks",
  "params": {
    "count": 8,
    "size": 0.07,
    "shift": 0.05,
    "seed": 1
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
