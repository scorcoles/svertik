# Physics

`type: "physics"` · Effector: acts per element (letters, copies, pieces…), usually through nested effects. · Editor menu: **Effect**.

A 2D dynamics simulation for the children of a group: each element is a rigid body, or elastic when it carries Soft Body. Collisions between bodies are optional; Solids are fixed obstacles from other objects (holes are kept, so a hollow shape can contain bodies). Acceleration is a constant force for all; Air drag slows moving bodies down; Friction and Bounce apply to every contact. Each child's start (velocity, spin, immovable, attraction) comes from Rigid Body, and a Gravity on a child adds its own pull and floor. A live world: it steps forward from the previous frame, so a body that appears (a Mouse Instance click in the group, a child that starts to exist, an Explosion's pieces) joins the running simulation at that moment, and seeking back restores a snapshot; editing the scene restarts it. In Play, the pointer can act on the body under it: Click push pushes it away from the click, Double-click burst breaks it into pieces that fly out from its centre, and Drag & throw grabs it with a spring and throws it on release. Network links follow the bodies they join. Up to 3600 seconds.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `time` | number | `0` | min 0, max 3600, step 0.01 | left out, it follows `scene.time`; label: Time (s) |
| `acceleration` | point | `[0,0]` | [x, y], px | unit: px; group: Forces |
| `damping` | number | `0` | min 0, max 20, step 0.1 | unit: 1/s; group: Forces; label: Air drag |
| `collisions` | boolean | `true` |  | group: Contacts; label: Body collisions |
| `solids` | nodes | `[]` | array of node ids | not animatable; group: Contacts |
| `friction` | number | `0` | min 0, max 1, step 0.01 | group: Contacts |
| `bounce` | number | `1` | min 0, max 1, step 0.01 | group: Contacts |
| `poke` | number | `0` | min 0, max 5000, step 10 | unit: px/s; group: Pointer; label: Click push |
| `burst` | number | `0` | min 0, max 16, step 1 | not animatable; group: Pointer; label: Double-click burst |
| `drag` | boolean | `false` |  | not animatable; group: Pointer; label: Drag & throw |
| `burstSpeed` | number | `250` | min 0, max 3000, step 10 | unit: px/s; group: Pointer; label: Burst speed |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "physics-1",
  "type": "physics",
  "params": {
    "time": {
      "$expr": "scene.time",
      "fallback": 0
    },
    "acceleration": [
      0,
      0
    ],
    "damping": 0,
    "collisions": true,
    "solids": [],
    "friction": 0,
    "bounce": 1,
    "poke": 0,
    "burst": 0,
    "drag": false,
    "burstSpeed": 250
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
