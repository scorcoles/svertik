# Gravity

`type: "gravity"` · Effector: acts per element (letters, copies, pieces…), usually through nested effects. · Editor menu: **Effect**.

Drops each element as a rigid body onto a virtual floor, inheriting velocity and spin from Explosion. Enable Collisions for piece-to-piece contacts; select Solids to collide with other objects as fixed obstacles. Friction and Bounce apply to all contacts. Only exterior contours collide, using simplified convex parts; internal holes are solid and gaps between disconnected shapes stay open; strokes are ignored. Targets use their current-frame geometry throughout the replay, not their past movement. Cached deterministic simulation, up to 60 seconds.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `time` | number | `1` | min 0, max 60, step 0.01 | label: Time (s) |
| `gravity` | number | `1` | min 0, max 10, step 0.01 | fraction of the drawing size |
| `floor` | point | `[0.5,1.5]` | [x, y], fractions of the box (0–1) | label: Floor position |
| `rotation` | angle | `0` | degrees | label: Floor rotation |
| `collisions` | boolean | `false` |  | not animatable; group: Contacts |
| `solids` | nodes | `[]` | array of node ids | not animatable; group: Contacts |
| `physics` | boolean | `true` |  | not animatable; label: Rigid bodies |
| `friction` | number | `0.7` | min 0, max 1, step 0.01 |  |
| `bounce` | number | `0.15` | min 0, max 1, step 0.01 |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "gravity-1",
  "type": "gravity",
  "params": {
    "time": 1,
    "gravity": 1,
    "floor": [
      0.5,
      1.5
    ],
    "rotation": 0,
    "collisions": false,
    "solids": [],
    "physics": true,
    "friction": 0.7,
    "bounce": 0.15
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
