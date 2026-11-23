# Soft Body

`type: "softbody"` · Deformer: moves the points of the drawing. · Editor menu: **Motion**.

Elastic material for open fibres and closed bodies. Stiffness, Bending, Keep area, Damping and Recovery define deformation and recovery; fibres may be free or pinned. Body model defaults to Outline; Beam adds a flexible internal spine and cross-sections that carry a broad bend through a closed, elongated body, then recover toward its rigid rest shape as impacts settle. Recovery controls how strongly it returns once internal motion dies down; Bounce and floor contacts still come from Gravity or Physics. Changes no geometry by itself. Apply to chooses both, fibres only or closed bodies only.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `mode` | enum | `"auto"` | `auto`, `fibers`, `bodies` | not animatable; label: Apply to |
| `body` | enum | `"outline"` | `outline`, `beam` | not animatable; label: Body model |
| `stiffness` | number | `0.8` | min 0, max 1, step 0.01 |  |
| `bending` | number | `0.15` | min 0, max 1, step 0.01 |  |
| `volume` | number | `0.9` | min 0, max 1, step 0.01 | label: Keep area |
| `damping` | number | `0.4` | min 0, max 1, step 0.01 |  |
| `recovery` | number | `10` | min 0, max 100, step 1 |  |
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
    "body": "outline",
    "stiffness": 0.8,
    "bending": 0.15,
    "volume": 0.9,
    "damping": 0.4,
    "recovery": 10,
    "pins": "free",
    "segments": 24
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
