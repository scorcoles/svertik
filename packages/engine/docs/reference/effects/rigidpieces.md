# Rigid Pieces

`type: "rigidpieces"` · Effector: marks elements as rigid pieces and applies nested deformers to each piece separately.

Place Rigid Pieces after a generator such as Voronoi, Mosaic or Clone. It marks each element as a rigid piece, then applies nested deformers independently using that piece's own bounds. Nested Transform and Rotate 3D are deferred until a downstream deformer actually moves that piece; a neutral deformer or a piece outside its influence leaves them inactive. Rotate 3D provides X, Y and Z rotation. The Pivot setting is shared with nested Transform and Rotate 3D, so it sets their rotation and scale anchor as well as the anchor used by compatible deformers later in the stack. Only deformers can be nested. Amount blends downstream deformers between their normal point-by-point result (0) and whole-piece rigid motion (1). Results are deterministic when seeking or exporting.

Compatible deformers: Spherize, Twist, Bend, Wave, Ripple, Noise, Taper, Shear, Cylinder and Perspective. Without Rigid Pieces, each effect keeps its normal point-by-point deformation. It does not run a physics simulation; use Gravity or Physics for falling and collisions.

| Parameter | Type | Default | Range | Description |
|---|---|---:|---:|---|
| Amount | number | 1 | 0–1 | Blends normal pointwise deformation (0) with whole-piece rigid motion (1). |
| Pivot | enum | Center | 9 positions | Shared rotation/scale anchor for nested Transform and Rotate 3D, and anchor for downstream rigid motion. |

Amount 0 follows the normal point-by-point deformation; Amount 1 moves each marked piece as a rigid element. Intermediate values blend between those results. Nested Transform and Rotate 3D only apply once a downstream deformer moves that piece. Their individual pivot fields are overridden by the shared Pivot setting.

```json
[
  { "id": "cells", "type": "voronoi", "params": { "spacing": 36 } },
  { "id": "plates", "type": "rigidpieces", "params": { "amount": 1, "pivot": "s" }, "children": [
    { "id": "piece-rotation", "type": "rotate3d", "params": { "rotateX": 12, "rotateY": -9, "rotateZ": 0 } }
  ] },
  { "id": "bulge", "type": "spherize", "params": { "strength": 0.5 } }
]
```
