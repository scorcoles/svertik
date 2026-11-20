# Network

`type: "network"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Utils**.

Draws lines between the nearest neighbouring input elements. With a Clone modifier before Network, each copy becomes a node; otherwise each shape is a node. Source shapes remain visible, with links rendered behind them. Closed shape outlines clip links to their edges; open shapes use their bounds. Each node links to its nearest `neighbors` nodes, and duplicate undirected links are merged. Gravity keeps each generated link end attached to its node as the bodies move and rotate; the wires themselves do not become simulated bodies or affect collisions.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `neighbors` | number | `2` | min 1, max 8, step 1 | label: Neighbors |
| `maxDistance` | number | `180` | min 0, max 1200, step 5 | unit: px; 0 means unlimited; label: Max distance |
| `gap` | number | `2` | min 0, max 100, step 0.5 | unit: px; label: Edge gap |
| `color` | color | `"#09fdd1"` | #rrggbb | label: Link color |
| `width` | number | `1.5` | min 0.1, max 24, step 0.1 | unit: px; label: Link width |

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
[
  { "id": "grid", "type": "clone", "params": { "mode": "grid", "columns": 8, "rows": 6, "spacing": [2.4, 2.4] } },
  { "id": "links", "type": "network", "params": { "neighbors": 3, "maxDistance": 150, "gap": 3, "color": "#09fdd1", "width": 1.5 } }
]
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
