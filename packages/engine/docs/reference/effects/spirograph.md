# Spirograph

`type: "spirograph"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Draw**.

Draws a closed rolling-gear curve inside the input bounds. Hypo rolls a wheel inside a ring; Epi rolls it outside. Ring teeth and Wheel teeth determine the gear ratio, Pen offset moves the drawing point away from the wheel centre, and Detail controls curve resolution.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `mode` | enum | `"hypo"` | `hypo`, `epi` | not animatable; label: Gear |
| `ring` | number | `84` | min 12, max 160, step 1 | label: Ring teeth |
| `wheel` | number | `23` | min 2, max 80, step 1 | label: Wheel teeth |
| `pen` | number | `0.82` | min 0, max 2, step 0.01 | label: Pen offset |
| `phase` | angle | `0` | degrees |  |
| `detail` | number | `1800` | min 120, max 4096, step 1 | not animatable |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "spirograph-1",
  "type": "spirograph",
  "params": {
    "mode": "hypo",
    "ring": 84,
    "wheel": 23,
    "pen": 0.82,
    "phase": 0,
    "detail": 1800
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
