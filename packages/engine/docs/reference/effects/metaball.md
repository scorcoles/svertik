# Metaball

`type: "metaball"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Deform**.

The elements melt together through a smooth union of their two nearest distance fields, keeping multiway junctions stable. Reach controls the blend width; negative Grow contracts the result and can separate narrow joins. Quality adds contour detail and is automatically capped to keep field sampling responsive.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `reach` | number | `30` | min 0, max 400, step 0.5 | unit: px |
| `grow` | number | `0` | min -100, max 100, step 0.5 | unit: px |
| `quality` | number | `100` | min 30, max 400, step 1 | not animatable |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "metaball-1",
  "type": "metaball",
  "params": {
    "reach": 30,
    "grow": 0,
    "quality": 100
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
