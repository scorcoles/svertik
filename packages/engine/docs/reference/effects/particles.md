# Particles

`type: "particles"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Generate**.

Seeded particle generator that uses the complete source object as its particle: geometry, colours and relative proportions are preserved. Burst or continuous stream, lifetime and fade, emitter area, direction, spread, velocity and spin. Free motion includes simple gravity; burst impulse mode passes velocity and spin to a following rigid-body Gravity. Animate Time in seconds or use scene.time. Up to 512 live particles, reduced for very complex sources.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `time` | number | `1` | min 0, max 60, step 0.01 | label: Time (s) |
| `emission` | enum | `"burst"` | `burst`, `stream` | not animatable |
| `count` | number | `64` | min 1, max 512, step 1 |  |
| `lifetime` | number | `3` | min 0.05, max 30, step 0.05 | label: Lifetime (s) |
| `seed` | seed | `1` | integer |  |
| `center` | point | `[0.5,0.5]` | [x, y], fractions of the box (0–1) | group: Emitter; label: Position |
| `emitter` | enum | `"circle"` | `point`, `line`, `box`, `circle` | not animatable; group: Emitter; label: Shape |
| `area` | point | `[0.15,0.15]` | [x, y], fractions of the box (0–1) | only when `emitter` is `line` or `box` or `circle`; group: Emitter |
| `motion` | enum | `"free"` | `free`, `impulse` | not animatable; only when `emission` is `burst`; group: Motion |
| `direction` | angle | `-90` | degrees | group: Motion |
| `spread` | number | `90` | min 0, max 360, step 1 | group: Motion; label: Spread (°) |
| `speed` | number | `0.8` | min 0, max 5, step 0.01 | fraction of the drawing size; group: Motion |
| `speedRandom` | number | `0.5` | min 0, max 1, step 0.01 | group: Motion; label: Speed variation |
| `spin` | angle | `180` | degrees | group: Motion |
| `gravity` | number | `0.6` | min 0, max 5, step 0.01 | fraction of the drawing size; group: Motion |
| `size` | number | `0.05` | min 0.001, max 1, step 0.001 | fraction of the drawing size; group: Appearance |
| `sizeRandom` | number | `0.6` | min 0, max 1, step 0.01 | group: Appearance; label: Size variation |
| `rotationRandom` | angle | `360` | degrees | group: Appearance; label: Rotation variation |
| `fade` | number | `0.2` | min 0, max 1, step 0.01 | group: Appearance; label: Fade out |
| `keepSource` | boolean | `false` |  | not animatable; group: Appearance; label: Keep source |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "particles-1",
  "type": "particles",
  "params": {
    "time": 1,
    "emission": "burst",
    "count": 64,
    "lifetime": 3,
    "seed": 1,
    "center": [
      0.5,
      0.5
    ],
    "emitter": "circle",
    "area": [
      0.15,
      0.15
    ],
    "motion": "free",
    "direction": -90,
    "spread": 90,
    "speed": 0.8,
    "speedRandom": 0.5,
    "spin": 180,
    "gravity": 0.6,
    "size": 0.05,
    "sizeRandom": 0.6,
    "rotationRandom": 360,
    "fade": 0.2,
    "keepSource": false
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
