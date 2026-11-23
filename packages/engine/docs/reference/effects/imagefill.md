# Image Fill

`type: "imagefill"` · Style: changes colours or paint, not the geometry. · Editor menu: **Style**.

Fills each shape from a raster image object in the scene. Hide source is on by default: the image stays available as a fill but is not drawn or treated as a separate physics body. Turn it off to show the source object. Cover preserves proportions and crops, Contain preserves proportions and leaves the fill colour behind, and Stretch fills the whole shape. Uses the original stack bounds as one shared image frame; Crack shards, Clone copies and Voronoi cells preserve that image material through generation, and it moves with Gravity.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `source` | node | `""` | id of another node | not animatable |
| `hideSource` | boolean | `true` |  | not animatable; group: Source; label: Hide source |
| `fit` | enum | `"cover"` | `cover`, `contain`, `stretch` | not animatable |
| `scale` | number | `1` | min 0.1, max 5, step 0.01 | group: Adjust |
| `position` | point | `[0.5,0.5]` | [x, y], fractions of the box (0–1) | group: Adjust |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "imagefill-1",
  "type": "imagefill",
  "params": {
    "source": "",
    "hideSource": true,
    "fit": "cover",
    "scale": 1,
    "position": [
      0.5,
      0.5
    ]
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
