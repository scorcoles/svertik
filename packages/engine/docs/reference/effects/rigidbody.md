# Rigid body

`type: "rigidbody"` · Deformer: moves the points of the drawing. · Editor menu: **Effect**.

Initial linear velocity and spin for a child inside a Physics group (or Gravity). Enable Immovable to turn it into a fixed collider that other bodies can hit. In Physics, enable Attractor to pull other rigid bodies toward the nearest point on this one's solid geometry with an inverse-square field. Hollow shapes preserve their holes, so bodies in a donut's opening are pulled toward its ring. Strength is relative to the largest moving body: at that distance, it accelerates by Strength × that body's size. Range is also relative to that body, with 0 meaning unlimited. Immovable attractors still exert their field.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `velocity` | point | `[0,0]` | [x, y], px | unit: px |
| `spin` | number | `0` | step 1 | unit: °/s |
| `immovable` | boolean | `false` |  |  |
| `attractor` | boolean | `false` |  | group: Attraction |
| `attractionStrength` | number | `1` | min 0, max 10, step 0.01 | unit: fraction; group: Attraction; label: Strength |
| `attractionRange` | number | `0` | min 0, max 10, step 0.1 | unit: fraction; 0 means unlimited; group: Attraction; label: Range |

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
    "immovable": false,
    "attractor": false,
    "attractionStrength": 1,
    "attractionRange": 0
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
