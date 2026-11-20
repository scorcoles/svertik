# Rigid Pieces

`type: "rigidpieces"` · Deformer: marks elements for downstream deformers.

Place Rigid Pieces after a generator such as Voronoi, Mosaic or Clone, and before a compatible deformer. Each element keeps its shape and size while its centre follows the deformation and its orientation follows the local direction of the field. Tilt adds more rotation as a piece moves; Alternate direction flips that added tilt between neighboring pieces. Both are deterministic from the current geometry, so seeking and export remain reproducible.

Compatible deformers: Spherize, Twist, Bend, Wave, Ripple, Noise, Taper, Shear, Cylinder and Perspective. Without Rigid Pieces, each effect keeps its normal point-by-point deformation. It does not run a physics simulation; use Gravity or Physics for falling and collisions.

| Parameter | Type | Default | Range | Description |
|---|---|---:|---:|---|
| Tilt | number | 0° | 0–90° | Extra turn as a fraction of the piece's displacement relative to its size. |
| Alternate direction | boolean | false | — | Tilts successive pieces in opposite directions. |

The displacement reaches full Tilt after moving about one piece width or height. Tilt 0 preserves the base orientation from the deformation field.

```json
[
  { "id": "cells", "type": "voronoi", "params": { "spacing": 36 } },
  { "id": "plates", "type": "rigidpieces", "params": { "tilt": 24, "alternate": true } },
  { "id": "bulge", "type": "spherize", "params": { "strength": 0.5 } }
]
```
