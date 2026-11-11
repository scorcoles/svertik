# Bend

`type: "bend"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

Curves the drawing like a sheet: the chosen axis becomes an arc of `angle` degrees. Positive angles bend the ends down (∩), negative ones up (∪).

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `angle` | angle | `90` | degrees |  |
| `axis` | enum | `"horizontal"` | `horizontal`, `vertical` | not animatable |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "bend-1",
  "type": "bend",
  "params": {
    "angle": 90,
    "axis": "horizontal"
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
