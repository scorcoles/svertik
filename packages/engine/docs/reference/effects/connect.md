# Connect

`type: "connect"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Utils**.

Joins two objects with a line that follows them: the drawing becomes the stretch from `from` to `to` (their anchors, fractions of their box), keeping its style. Straight, arc, horizontal or vertical; from edge to edge with a `gap`; optional arrowheads. Utils → Connector creates it.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `from` | node | `""` | id of another node |  |
| `to` | node | `""` | id of another node |  |
| `shape` | enum | `"straight"` | `straight`, `arc`, `horizontal`, `vertical` | not animatable |
| `bend` | number | `0.3` | min -2, max 2, step 0.01 |  |
| `edges` | boolean | `true` |  |  |
| `gap` | number | `6` | min 0, max 200, step 0.5 | unit: px |
| `arrow` | enum | `"none"` | `none`, `end`, `start`, `both` | not animatable |
| `arrowSize` | number | `10` | min 1, max 100, step 0.5 | unit: px; only when `arrow` is `end` or `start` or `both`; label: Arrow size |
| `fromAnchor` | point | `[0.5,0.5]` | [x, y], fractions of the box (0–1) | group: Anchors; label: From anchor |
| `toAnchor` | point | `[0.5,0.5]` | [x, y], fractions of the box (0–1) | group: Anchors; label: To anchor |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "connect-1",
  "type": "connect",
  "params": {
    "from": "",
    "to": "",
    "shape": "straight",
    "bend": 0.3,
    "edges": true,
    "gap": 6,
    "arrow": "none",
    "arrowSize": 10,
    "fromAnchor": [
      0.5,
      0.5
    ],
    "toAnchor": [
      0.5,
      0.5
    ]
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
