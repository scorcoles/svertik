# Rigid Pieces

`type: "rigidpieces"` · Effector: marks elements as rigid pieces and applies nested deformers to each piece separately.

Place Rigid Pieces after a generator such as Voronoi, Mosaic or Clone. It marks each element as a rigid piece, then applies nested deformers independently using that piece's own bounds. Nest Transform or Rotate 3D to move, spin, scale or tilt each piece; Rotate 3D provides X, Y and Z rotation. Only deformers can be nested. The Pivot setting below controls the anchor used by compatible deformers that move and rotate rigid pieces further down the stack. Each piece keeps its shape during those downstream deformations, while its centre follows the field and its orientation follows the local direction. Tilt adds extra displacement-driven rotation; Alternate tilt reverses that added turn on successive pieces. Results are deterministic when seeking or exporting.

Compatible deformers: Spherize, Twist, Bend, Wave, Ripple, Noise, Taper, Shear, Cylinder and Perspective. Without Rigid Pieces, each effect keeps its normal point-by-point deformation. It does not run a physics simulation; use Gravity or Physics for falling and collisions.

| Parameter | Type | Default | Range | Description |
|---|---|---:|---:|---|
| Tilt | number | 0° | 0–90° | Extra turn as a fraction of the piece's displacement relative to its size. |
| Alternate tilt | boolean | false | — | Tilts successive pieces in opposite directions. |
| Pivot | enum | Center | 9 positions | Anchor for the downstream displacement-driven rotation: Center, N, NE, E, SE, S, SW, W or NW. |

The displacement reaches full Tilt after moving about one piece width or height. Tilt 0 preserves the base orientation from the deformation field. The nested Transform and Rotate 3D controls have their own per-piece pivot setting.

```json
[
  { "id": "cells", "type": "voronoi", "params": { "spacing": 36 } },
  { "id": "plates", "type": "rigidpieces", "params": { "tilt": 0, "alternate": false, "pivot": "s" }, "children": [
    { "id": "piece-rotation", "type": "rotate3d", "params": { "rotateX": 12, "rotateY": -9, "rotateZ": 0 } }
  ] },
  { "id": "bulge", "type": "spherize", "params": { "strength": 0.5 } }
]
```
