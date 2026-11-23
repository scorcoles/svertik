# Glow

`type: "glow"` · SVG filter: does not change the geometry; the browser applies it to the whole object after the rest of its stack. · Editor menu: **Filters**.

A coloured halo around the drawing, behind it.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `size` | number | `10` | min 0, max 100, step 0.5 | unit: px |
| `color` | color | `"#09fdd1"` | #rrggbb |  |
| `strength` | number | `0.8` | min 0, max 3, step 0.05 |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "glow-1",
  "type": "glow",
  "params": {
    "size": 10,
    "color": "#09fdd1",
    "strength": 0.8
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
