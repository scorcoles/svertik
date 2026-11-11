# Streaks

`type: "streaks"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Glitch**.

Glitch: streaks escaping sideways from the real edge of the shape. With Bite, the band looks shifted: what sticks out on one side is missing on the other.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `count` | number | `6` | min 1, max 40, step 1 |  |
| `length` | number | `0.15` | min 0.01, max 1, step 0.01 | fraction of the drawing size |
| `width` | number | `1.5` | min 0.25, max 10, step 0.25 | unit: px |
| `bite` | number | `1` | min 0, max 2, step 0.05 |  |
| `seed` | seed | `1` | integer |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "streaks-1",
  "type": "streaks",
  "params": {
    "count": 6,
    "length": 0.15,
    "width": 1.5,
    "bite": 1,
    "seed": 1
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
