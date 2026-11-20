# Rigid Pieces

`type: "rigidpieces"` · Deformer: marks elements for downstream deformers.

Place Rigid Pieces after a generator such as Voronoi, Mosaic or Clone, and before a compatible deformer. Each element keeps its shape and size while its centre follows the deformation and its orientation follows the local direction of the field.

Compatible deformers: Spherize, Twist, Bend, Wave, Ripple, Noise, Taper, Shear, Cylinder and Perspective. Without Rigid Pieces, each effect keeps its normal point-by-point deformation. Rigid Pieces has no parameters and does not run a physics simulation; use Gravity or Physics for falling and collisions.

```json
[
  { "id": "cells", "type": "voronoi", "params": { "spacing": 36 } },
  { "id": "plates", "type": "rigidpieces" },
  { "id": "bulge", "type": "spherize", "params": { "strength": 0.5 } }
]
```
