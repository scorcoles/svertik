# Radial Cut

`type: "radialcut"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Generate**.

Cuts filled shapes into radial sectors like slices of a cake. Count controls the number of pieces. Offset rotates the whole cut. Spin progressively rotates each sector around its own centre to create a pinwheel or spiral. Drag Center to move the pivot. Separation pulls each sector outward from that point.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `count` | number | `8` | min 2, max 72, step 1 | group: Slices |
| `angleOffset` | angle | `0` | degrees | group: Slices; label: Offset |
| `spin` | angle | `0` | degrees | group: Slices |
| `separation` | number | `0` | min 0, max 100, step 0.5 | unit: px |
| `center` | point | `[0.5,0.5]` | [x, y], fractions of the box (0–1) |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "radialcut-1",
  "type": "radialcut",
  "params": {
    "count": 8,
    "angleOffset": 0,
    "spin": 0,
    "separation": 0,
    "center": [
      0.5,
      0.5
    ]
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
