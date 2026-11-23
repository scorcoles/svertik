# Particles

`type: "particles"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Generate**.

Seeded particle generator that uses the complete source object as its particle: geometry, colours and relative proportions are preserved. Burst or continuous stream, lifetime and fade, emitter area, direction, spread, velocity and spin. Free motion supports gravity, drag, constant wind drift, smooth seeded turbulence and spiral motion. Lifetimes can vary; particles can fade in, fade out and change size over their life, and Stretch by speed lengthens each one along its direction of travel (motion streaks for sparks, rain or fireworks). Explicit birth rate, prewarm and reference size separate emission and motion scale from the source artwork. Burst impulse mode passes velocity and spin to a following Gravity or to the Physics of an enclosing group. Time follows scene.time unless it is set (a number, keys or a formula). Up to 512 live particles, reduced for very complex sources.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `time` | number | `1` | min 0, step 0.01 | left out, it follows `scene.time`; label: Time (s) |
| `emission` | enum | `"burst"` | `burst`, `stream` | not animatable |
| `count` | number | `64` | min 1, max 512, step 1 |  |
| `lifetime` | number | `3` | min 0.05, max 30, step 0.05 | label: Lifetime (s) |
| `lifetimeRandom` | number | `0` | min 0, max 1, step 0.01 | label: Life variation |
| `rate` | number | `0` | min 0, max 2000, step 1 | unit: /s; only when `emission` is `stream`; label: Birth rate (0 = auto) |
| `prewarm` | boolean | `false` |  | not animatable; only when `emission` is `stream` |
| `seed` | seed | `1` | integer |  |
| `center` | point | `[0.5,0.5]` | [x, y], fractions of the box (0–1) | group: Emitter; label: Position |
| `emitter` | enum | `"circle"` | `point`, `line`, `box`, `circle` | not animatable; group: Emitter; label: Shape |
| `area` | point | `[0.15,0.15]` | [x, y], fractions of the box (0–1) | only when `emitter` is `line` or `box` or `circle`; group: Emitter |
| `referenceSize` | number | `0` | min 0, step 1 | unit: px; group: Emitter; label: Reference size (0 = source) |
| `motion` | enum | `"free"` | `free`, `impulse` | not animatable; only when `emission` is `burst`; group: Motion |
| `direction` | angle | `-90` | degrees | group: Motion |
| `spread` | number | `90` | min 0, max 360, step 1 | group: Motion; label: Spread (°) |
| `speed` | number | `0.8` | min 0, max 5, step 0.01 | fraction of the drawing size; group: Motion |
| `speedRandom` | number | `0.5` | min 0, max 1, step 0.01 | group: Motion; label: Speed variation |
| `spin` | angle | `180` | degrees | group: Motion |
| `gravity` | number | `0.6` | min 0, max 5, step 0.01 | fraction of the drawing size; group: Motion |
| `wind` | point | `[0,0]` | [x, y], fractions of the box (0–1) | group: Motion |
| `drag` | number | `0` | min 0, max 20, step 0.05 | group: Motion |
| `turbulence` | number | `0` | min 0, max 2, step 0.01 | group: Motion |
| `turbulenceFrequency` | number | `0.5` | min 0.05, max 5, step 0.05 | unit: Hz; group: Motion; label: Turbulence frequency |
| `swirl` | angle | `0` | degrees | group: Motion; label: Swirl (°/s) |
| `alignToMotion` | boolean | `false` |  | not animatable; group: Motion; label: Align to motion |
| `stretch` | number | `0` | min 0, max 5, step 0.05 | group: Appearance; label: Stretch by speed |
| `size` | number | `0.05` | min 0.001, max 1, step 0.001 | fraction of the drawing size; group: Appearance |
| `sizeRandom` | number | `0.6` | min 0, max 1, step 0.01 | group: Appearance; label: Size variation |
| `rotationRandom` | angle | `360` | degrees | group: Appearance; label: Rotation variation |
| `fade` | number | `0.2` | min 0, max 1, step 0.01 | group: Appearance; label: Fade out |
| `fadeIn` | number | `0` | min 0, max 1, step 0.01 | group: Appearance; label: Fade in |
| `sizeEnd` | number | `1` | min 0, max 5, step 0.05 | group: Appearance; label: End size × |
| `keepSource` | boolean | `false` |  | not animatable; group: Appearance; label: Keep source |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "particles-1",
  "type": "particles",
  "params": {
    "time": {
      "$expr": "scene.time",
      "fallback": 1
    },
    "emission": "burst",
    "count": 64,
    "lifetime": 3,
    "lifetimeRandom": 0,
    "rate": 0,
    "prewarm": false,
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
    "referenceSize": 0,
    "motion": "free",
    "direction": -90,
    "spread": 90,
    "speed": 0.8,
    "speedRandom": 0.5,
    "spin": 180,
    "gravity": 0.6,
    "wind": [
      0,
      0
    ],
    "drag": 0,
    "turbulence": 0,
    "turbulenceFrequency": 0.5,
    "swirl": 0,
    "alignToMotion": false,
    "stretch": 0,
    "size": 0.05,
    "sizeRandom": 0.6,
    "rotationRandom": 360,
    "fade": 0.2,
    "fadeIn": 0,
    "sizeEnd": 1,
    "keepSource": false
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
