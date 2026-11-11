# Slices

`type: "slices"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Glitch**.

Glitch: horizontal bands of the drawing shifted sideways, each one an element.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `count` | number | `14` | min 1, max 60, step 1 |  |
| `chance` | number | `0.45` | min 0, max 1, step 0.01 | label: Shifted |
| `shift` | number | `0.05` | min 0, max 0.4, step 0.005 | fraction of the drawing size |
| `seed` | seed | `1` | integer |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "slices-1",
  "type": "slices",
  "params": {
    "count": 14,
    "chance": 0.45,
    "shift": 0.05,
    "seed": 1
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
