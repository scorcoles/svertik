# Path Wrap

`type: "pathwrap"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

Wraps the drawing along another object's path (its longest one). The drawing's axis follows the path; what is across it moves away from it. `stretch` fills the whole path; `keep` keeps its length and starts at `offset`.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `target` | node | `""` | id of another node | label: Path |
| `axis` | enum | `"horizontal"` | `horizontal`, `vertical` | not animatable |
| `fit` | enum | `"stretch"` | `stretch`, `keep` | not animatable |
| `offset` | number | `0` | min -1, max 1, step 0.01 | fraction of the drawing size |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "pathwrap-1",
  "type": "pathwrap",
  "params": {
    "target": "",
    "axis": "horizontal",
    "fit": "stretch",
    "offset": 0
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
