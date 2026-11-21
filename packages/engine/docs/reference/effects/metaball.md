# Metaball

`type: "metaball"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Generate**.

The elements melt into each other like drops when they get close. A smooth union of the two nearest distance fields gives stable joins at multiway junctions; accumulating every pairwise join can deepen those junctions into folds. The outline is emitted as a smooth vector path.

**Reach** controls how wide the blend is. **Grow** offsets the resulting field: positive values expand it, while negative values contract it. A strong negative Grow can cut through narrow joins; increase Reach or move Grow closer to zero to keep neighboring forms connected. Quality controls contour detail and is automatically capped to about 120,000 field samples, so very high values do not create unbounded work.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `reach` | number | `30` | min 0, max 400, step 0.5 | unit: px |
| `grow` | number | `0` | min -100, max 100, step 0.5 | unit: px |
| `quality` | number | `100` | min 30, max 400, step 1 | not animatable; the effective value is capped to bound field samples |

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
