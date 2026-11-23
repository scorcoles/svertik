# Rigid Pieces

`type: "rigidpieces"` · Effector: acts per element (letters, copies, pieces…), usually through nested effects. · Editor menu: **Effect**.

Marks each current element as a rigid piece. Amount blends normal pointwise deformation with whole-piece motion: 0 bends normally, 1 preserves the piece shape. Nested Transform and Transform 3D wait until a downstream deformer actually moves the piece. Transform 3D also moves each piece along camera Z, projecting that depth into scale. Nest Color, Tint, Opacity, Paint, Gradient or Feather to style pieces individually; Pivot sets the shared rotation anchor.

Takes nested deformers and per-piece style effects (`color`, `tint`, `opacity`, `paint`, `gradient`, `feather`). Transform and Rotate 3D are deferred until a downstream deformer moves the piece. Nested effectors are not allowed.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `amount` | number | `1` | min 0, max 1, step 0.01 |  |
| `pivot` | enum | `"center"` | `center`, `n`, `ne`, `e`, `se`, `s`, `sw`, `w`, `nw` | not animatable |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "rigidpieces-1",
  "type": "rigidpieces",
  "params": {
    "amount": 1,
    "pivot": "center"
  },
  "children": [
    {
      "id": "twist-1",
      "type": "twist",
      "params": {
        "angle": 30
      }
    }
  ]
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
