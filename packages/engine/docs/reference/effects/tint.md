# Tint

`type: "tint"` · Style: changes colours or paint, not the geometry. · Editor menu: **Style**.

Pushes the colour towards a target colour. Inside Step the amount grows copy by copy (white lightens, black darkens).

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `color` | color | `"#ffffff"` | #rrggbb |  |
| `amount` | number | `0.3` | min 0, max 1, step 0.01 |  |
| `target` | enum | `"fill"` | `fill`, `stroke`, `both` | not animatable |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "tint-1",
  "type": "tint",
  "params": {
    "color": "#ffffff",
    "amount": 0.3,
    "target": "fill"
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
