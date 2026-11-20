# Rigid body

`type: "rigidbody"` · Deformer: moves the points of the drawing. · Editor menu: **Effect**.

Initial linear velocity and spin for a child inside a Physics group (or Gravity). Enable Immovable to turn it into a fixed collider that other bodies can hit.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `velocity` | point | `[0,0]` | [x, y], px | unit: px |
| `spin` | number | `0` | step 1 | unit: °/s |
| `immovable` | boolean | `false` |  |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "rigidbody-1",
  "type": "rigidbody",
  "params": {
    "velocity": [
      0,
      0
    ],
    "spin": 0,
    "immovable": false
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
