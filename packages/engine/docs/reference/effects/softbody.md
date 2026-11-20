# Soft Body

`type: "softbody"` · Deformer: moves the points of the drawing. · Editor menu: **Effect**.

Elastic material for open fibres and closed bodies. Stiffness, Bending, Keep area and Damping define deformation and recovery; fibres may be free or pinned. Changes no geometry by itself. Put it before Gravity, or on a child of a Physics group: those effects own Time, forces, Floor, Solids and body collisions. Mode chooses both, fibres only or closed bodies only.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `mode` | enum | `"auto"` | `auto`, `fibers`, `bodies` | not animatable; label: Apply to |
| `stiffness` | number | `0.8` | min 0, max 1, step 0.01 |  |
| `bending` | number | `0.15` | min 0, max 1, step 0.01 |  |
| `volume` | number | `0.9` | min 0, max 1, step 0.01 | label: Keep area |
| `damping` | number | `0.4` | min 0, max 1, step 0.01 |  |
| `pins` | enum | `"free"` | `free`, `start`, `ends` | not animatable; label: Pin fibers |
| `segments` | number | `24` | min 4, max 64, step 1 | not animatable; label: Resolution |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "softbody-1",
  "type": "softbody",
  "params": {
    "mode": "auto",
    "stiffness": 0.8,
    "bending": 0.15,
    "volume": 0.9,
    "damping": 0.4,
    "pins": "free",
    "segments": 24
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
