# Blob

`type: "blob"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

Turns every outline into a blob: a smooth closed curve with no straight sides or corners. Inset first pulls the outline inwards (px; negative grows it), which on touching cells such as Voronoi or Mosaic opens the gaps between them; a cell smaller than the inset disappears. Roundness sets how much of each side the corners take: 0 keeps the polygon, 1 is a tangent-continuous curve through the middle of every side. Curved input is sampled first, so circles stay round and straight sides keep their real corners. Open paths keep their ends. Stack Noise or Displace after it for an irregular, organic edge.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `roundness` | number | `1` | min 0, max 1, step 0.01 |  |
| `inset` | number | `0` | min -100, max 200, step 0.5 | unit: px |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "blob-1",
  "type": "blob",
  "params": {
    "roundness": 1,
    "inset": 0
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
