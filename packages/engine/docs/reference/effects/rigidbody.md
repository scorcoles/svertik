# Rigid Body

`type: "rigidbody"` · Deformer: moves the points of the drawing. · Editor menu: **Motion**.

How a child of a Physics group (or of an object with Gravity) starts: initial Velocity and Spin, Immovable to make it a fixed collider, and the Mass center (Auto uses the geometry's; Custom moves it with a handle, changing how the body turns and rests). Attractor pulls the other rigid bodies towards the nearest point of its solid geometry with an inverse-square field (holes kept): Strength and Range are relative to the largest body, moving or fixed; the reaction moves the attractor unless it is Immovable. Absorption reduces bounce and damps motion on impact while keeping the approach speed, and Settle zeroes residual motion below a speed, so bodies rebound a few times and come to rest. Pin holds one point of the body (Point, fractions of its box; the left middle, where Bones' chain starts, by default) where it is: the body turns about it, as a hinge, and contacts turn it instead of shifting it.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `velocity` | point | `[0,0]` | [x, y], px | unit: px |
| `spin` | number | `0` | step 1 | unit: °/s |
| `immovable` | boolean | `false` |  |  |
| `pin` | boolean | `false` |  | not animatable; only when `immovable` is `false`; group: Pin |
| `pinPoint` | point | `[0,0.5]` | [x, y], fractions of the box (0–1) | only when `immovable` is `false` and `pin` is `true`; group: Pin; label: Point |
| `centerOfMassMode` | enum | `"auto"` | `auto`, `custom` | group: Mass; label: Mass center |
| `centerOfMass` | point | `[0.5,0.5]` | [x, y], fractions of the box (0–1) | only when `centerOfMassMode` is `custom`; group: Mass; label: Position |
| `attractor` | boolean | `false` |  | group: Attraction |
| `attractionStrength` | number | `1` | min 0, max 10, step 0.01 | fraction of the drawing size; group: Attraction; label: Strength |
| `attractionRange` | number | `0` | min 0, max 10, step 0.1 | fraction of the drawing size; group: Attraction; label: Range |
| `attractionAbsorption` | number | `0.5` | min 0, max 1, step 0.01 | fraction of the drawing size; group: Attraction; label: Absorption |
| `attractionSleepThreshold` | number | `0.03` | min 0, max 0.2, step 0.005 | fraction of the drawing size; group: Attraction; label: Settle |

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
    "pin": false,
    "pinPoint": [
      0,
      0.5
    ],
    "centerOfMassMode": "auto",
    "centerOfMass": [
      0.5,
      0.5
    ],
    "attractor": false,
    "attractionStrength": 1,
    "attractionRange": 0,
    "attractionAbsorption": 0.5,
    "attractionSleepThreshold": 0.03
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
