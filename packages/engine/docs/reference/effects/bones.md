# Bones

`type: "bones"` · Deformer: moves the points of the drawing. · Editor menu: **Deform**.

A chain of 2 to 6 equal bones from Start to End. Each bone turns on its joint (relative to the previous one) and drags what is around it, with a smooth transition at each joint. With a Target, the angles are solved (IK) so the tip reaches it.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `segments` | number | `3` | min 2, max 6, step 1 |  |
| `angle1` | angle | `12` | degrees | only when `ik` is `false`; label: Bone 1 |
| `angle2` | angle | `12` | degrees | only when `ik` is `false`; label: Bone 2 |
| `angle3` | angle | `12` | degrees | only when `ik` is `false` and `segments` is `3` or `4` or `5` or `6`; label: Bone 3 |
| `angle4` | angle | `12` | degrees | only when `ik` is `false` and `segments` is `4` or `5` or `6`; label: Bone 4 |
| `angle5` | angle | `12` | degrees | only when `ik` is `false` and `segments` is `5` or `6`; label: Bone 5 |
| `angle6` | angle | `12` | degrees | only when `ik` is `false` and `segments` is `6`; label: Bone 6 |
| `smooth` | number | `0.5` | min 0, max 1, step 0.01 |  |
| `ik` | boolean | `false` |  | not animatable |
| `target` | point | `[0.8,0.1]` | [x, y], fractions of the box (0–1) | only when `ik` is `true` |
| `start` | point | `[0,0.5]` | [x, y], fractions of the box (0–1) | group: Chain |
| `end` | point | `[1,0.5]` | [x, y], fractions of the box (0–1) | group: Chain |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "bones-1",
  "type": "bones",
  "params": {
    "segments": 3,
    "angle1": 12,
    "angle2": 12,
    "angle3": 12,
    "angle4": 12,
    "angle5": 12,
    "angle6": 12,
    "smooth": 0.5,
    "ik": false,
    "target": [
      0.8,
      0.1
    ],
    "start": [
      0,
      0.5
    ],
    "end": [
      1,
      0.5
    ]
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
