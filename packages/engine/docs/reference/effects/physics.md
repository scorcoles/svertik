# Physics

`type: "physics"` · Effector: acts per element (letters, copies, pieces…), usually through nested effects. · Editor menu: **Effect**.

A deterministic 2D dynamics simulation for a group: rigid by default, with elastic deformation on children carrying Soft Body material. Add Rigid body to individual children to set their initial velocity, spin, or make them immovable. Enable Attractor on a child to pull other rigid bodies toward the nearest point on its solid geometry with an inverse-square field. Hollow shapes preserve their holes, so a body in a donut's opening is attracted toward the ring instead of the centre. Strength is relative to the largest moving body, and Range limits the radius in multiples of that size (0 means unlimited). Attraction is reciprocal: a movable attractor feels the opposite force, scaled by the affected body's mass. Mark it Immovable to absorb that reaction and keep it fixed. Acceleration, friction, restitution and static solid targets are optional; zero acceleration and friction preserve motion between elastic collisions. Ordinary filled paths, including holes, form colliders; Soft Body also supports open elastic fibres. When its input changes pieces over time (an animated Mosaic, an Explosion), each new piece takes over from the body it comes from, with its position, angle and speed, instead of the simulation starting over.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `time` | number | `0` | min 0, max 60, step 0.01 | label: Time (s) |
| `acceleration` | point | `[0,0]` | [x, y], px | unit: px; group: Forces |
| `collisions` | boolean | `true` |  | group: Contacts; label: Body collisions |
| `solids` | nodes | `[]` | array of node ids | not animatable; group: Contacts; label: Solid targets |
| `friction` | number | `0` | min 0, max 1, step 0.01 | group: Contacts |
| `bounce` | number | `1` | min 0, max 1, step 0.01 | group: Contacts; label: Restitution |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "physics-1",
  "type": "physics",
  "params": {
    "time": 0,
    "acceleration": [
      0,
      0
    ],
    "collisions": true,
    "solids": [],
    "friction": 0,
    "bounce": 1
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
