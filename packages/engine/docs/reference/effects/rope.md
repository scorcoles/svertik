# Rope

`type: "rope"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

Open paths hang as ropes pinned at both ends: a Verlet chain with the drawn length, Gravity, Wind and Damping, that settles and swings. Pointer and Radius place a round obstacle (bind Pointer to the cursor with a follow interaction) that pushes the ropes out of its way. The editor binds Time to scene.time when adding Rope; keep it first in the stack, as it keeps its state between frames. Closed paths are left alone.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `time` | number | `0` | min 0, max 100000, step 0.01 | label: Time (s) |
| `gravity` | number | `1` | min 0, max 10, step 0.01 | fraction of the drawing size |
| `wind` | number | `0` | min 0, max 5, step 0.01 |  |
| `damping` | number | `0.8` | min 0, max 20, step 0.05 |  |
| `stiffness` | number | `14` | min 1, max 60, step 1 | not animatable |
| `segments` | number | `24` | min 4, max 120, step 1 | not animatable |
| `pointer` | point | `[-2,-2]` | [x, y], fractions of the box (0–1) | group: Pointer |
| `space` | enum | `"box"` | `box`, `scene` | not animatable; group: Pointer; label: Pointer in |
| `radius` | number | `0` | min 0, max 1, step 0.005 | fraction of the drawing size; group: Pointer |
| `settle` | number | `0` | min 0, max 10, step 0.1 | unit: s; not animatable; label: Settle (s) |
| `seed` | seed | `1` | integer | group: Wind |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "rope-1",
  "type": "rope",
  "params": {
    "time": 0,
    "gravity": 1,
    "wind": 0,
    "damping": 0.8,
    "stiffness": 14,
    "segments": 24,
    "pointer": [
      -2,
      -2
    ],
    "space": "box",
    "radius": 0,
    "settle": 0,
    "seed": 1
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
