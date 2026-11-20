# Network

`type: "network"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Utils**.

Draws elastic wires between the nearest neighbouring input elements. With a Clone modifier before Network, each copy becomes a node; otherwise each shape is a node. Source shapes remain visible, with links rendered behind them. Closed shape outlines clip links to their edges; open shapes use their bounds. Each node links to its nearest `neighbors` nodes, and duplicate undirected links are merged. Explosion and Gravity keep each wire end attached to its node; wires themselves do not become simulated bodies or affect collisions. When nodes move closer, Elasticity adds a slack curve. Resistance sets the maximum stretch ratio before a wire breaks; a broken wire is omitted for that evaluated frame.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `neighbors` | number | `2` | min 1, max 8, step 1 | label: Neighbors |
| `maxDistance` | number | `180` | min 0, max 1200, step 5 | unit: px; 0 means unlimited; label: Max distance |
| `gap` | number | `2` | min 0, max 100, step 0.5 | unit: px; label: Edge gap |
| `elasticity` | number | `0.35` | min 0, max 1, step 0.01 | 0 keeps slack links straight; 1 gives them the full slack curve. |
| `resistance` | number | `3` | min 1, max 8, step 0.1 | Breaks the wire when endpoint distance exceeds this multiple of its original length. |
| `color` | color | `"#09fdd1"` | #rrggbb | label: Link color |
| `width` | number | `1.5` | min 0.1, max 24, step 0.1 | unit: px; label: Link width |

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
[
  { "id": "grid", "type": "clone", "params": { "mode": "grid", "columns": 8, "rows": 6, "spacing": [2.4, 2.4] } },
  { "id": "links", "type": "network", "params": { "neighbors": 3, "maxDistance": 150, "gap": 3, "elasticity": 0.35, "resistance": 3, "color": "#09fdd1", "width": 1.5 } }
]
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
