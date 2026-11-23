# Thicken

`type: "thicken"` · SVG filter: does not change the geometry; the browser applies it to the whole object after the rest of its stack. · Editor menu: **Filters**.

Makes the drawing thicker (or thinner with a negative amount), or adds a coloured outline around it like a sticker (`outline`). Works on whatever is painted: text, strokes, anything.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `mode` | enum | `"grow"` | `grow`, `outline` | not animatable |
| `amount` | number | `3` | min -40, max 40, step 0.5 | unit: px |
| `color` | color | `"#ffffff"` | #rrggbb | only when `mode` is `outline` |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "thicken-1",
  "type": "thicken",
  "params": {
    "mode": "grow",
    "amount": 3,
    "color": "#ffffff"
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
