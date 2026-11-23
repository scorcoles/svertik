# Shadow

`type: "shadow"` · SVG filter: does not change the geometry; the browser applies it to the whole object after the rest of its stack. · Editor menu: **Filters**.

Drop shadow: a blurred, shifted copy behind the drawing, in one colour.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `offset` | point | `[6,8]` | [x, y], px | unit: px |
| `blur` | number | `6` | min 0, max 100, step 0.5 | unit: px |
| `color` | color | `"#000000"` | #rrggbb |  |
| `opacity` | number | `0.5` | min 0, max 1, step 0.01 |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "shadow-1",
  "type": "shadow",
  "params": {
    "offset": [
      6,
      8
    ],
    "blur": 6,
    "color": "#000000",
    "opacity": 0.5
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
