# Mask

`type: "mask"` · Style: changes colours or paint, not the geometry. · Editor menu: **Style**.

Native SVG mask: the object only shows where another object lets it (`source`). `shape`: inside the mask's shape (`invert`: outside). `luminance`: the mask's colours decide (white shows, black hides; a gradient gives soft fades). The mask can be hidden and still works.

Applied by the document after the whole stack (and its filters), as a native `<mask>`.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `source` | node | `""` | id of another node | label: Mask |
| `mode` | enum | `"shape"` | `shape`, `luminance` | not animatable |
| `invert` | boolean | `false` |  | not animatable; only when `mode` is `shape` |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "mask-1",
  "type": "mask",
  "params": {
    "source": "",
    "mode": "shape",
    "invert": false
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
