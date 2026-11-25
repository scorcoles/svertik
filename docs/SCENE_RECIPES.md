# svertik Scene Recipes (Templates for AI Agents)

> **Copy-pasteable JSON scene templates ready for headless rendering or engine scripting.**  
> Every scene in this document complies with `SceneV1` and can be saved directly as `.json` and rendered via `pnpm svertik render <scene.json> -o out.svg`.

---

## Shared procedural variables

Scenes can define document-scoped numeric variables in `custom`. Use them in numeric expressions as
`scene.custom.name`; a variable can reference another variable, so changing one control can update a whole
procedural setup. Expressions use the same safe math language as effect expressions. Missing references and
dependency cycles use the stored `fallback` values. Nested compositions have their own custom-variable scope.

```json
{
  "version": 1,
  "custom": {
    "seed": 42,
    "spacing": { "$expr": "scene.custom.seed % 9 + 4", "fallback": 10 }
  },
  "objects": [
    {
      "kind": "shape",
      "id": "grid-cell",
      "name": "Grid cell",
      "shape": "rectangle",
      "params": {
        "width": { "$expr": "scene.custom.spacing", "fallback": 10 },
        "height": { "$expr": "scene.custom.spacing * 2", "fallback": 20 }
      },
      "stack": []
    }
  ]
}
```

## Recipe 1: Kinetic Wavy Typography

Text where each letter is an individual element. A sinusoidal wave sweeps across the letters, backed by a deep drop shadow and an animated wave phase.

```json
{
  "version": 1,
  "document": { "width": 800, "height": 450, "x": 0, "y": 0 },
  "objects": [
    {
      "kind": "shape",
      "id": "text-title",
      "name": "Kinetic Title",
      "shape": "text",
      "params": {
        "text": "SVERTIK",
        "size": 96,
        "tracking": 60,
        "align": "center",
        "fill": true,
        "fillColor": "#09fdd1",
        "stroke": false
      },
      "transform": { "x": 0, "y": 0 },
      "stack": [
        {
          "id": "wave-letters",
          "type": "wave",
          "params": {
            "amplitude": 0.08,
            "wavelength": 0.5,
            "phase": 0,
            "direction": 90
          }
        },
        {
          "id": "shadow-text",
          "type": "shadow",
          "params": {
            "offset": [0, 14],
            "blur": 24,
            "color": "#050508",
            "opacity": 0.6
          }
        }
      ]
    }
  ],
  "animation": {
    "duration": 3,
    "loop": true,
    "autoplay": true,
    "fps": 30,
    "tracks": [
      {
        "id": "track-wave-phase",
        "node": "text-title",
        "on": "modifier",
        "modifier": "wave-letters",
        "param": "phase",
        "keys": [
          { "t": 0, "value": 0, "ease": "linear" },
          { "t": 3, "value": 360 }
        ]
      }
    ]
  }
}
```

---

## Recipe 2: Procedural Generative Mandala Poster

A 6-point star cloned in a radial pattern of 12 copies, twisted from the center, with rounded corners and an outer glow.

```json
{
  "version": 1,
  "document": { "width": 600, "height": 600, "x": 0, "y": 0 },
  "objects": [
    {
      "kind": "shape",
      "id": "base-mandala",
      "name": "Mandala",
      "shape": "star",
      "params": {
        "radius": 140,
        "inner": 0.5,
        "points": 6,
        "fill": true,
        "fillColor": "#ffffff",
        "stroke": true,
        "strokeColor": "#09fdd1",
        "strokeWidth": 2
      },
      "stack": [
        {
          "id": "radial-cloner",
          "type": "clone",
          "params": {
            "mode": "radial",
            "count": 12,
            "radius": 0.3
          }
        },
        {
          "id": "core-twist",
          "type": "twist",
          "params": {
            "radius": 0.8,
            "angle": 120
          }
        },
        {
          "id": "corner-rounding",
          "type": "roundcorners",
          "params": {
            "radius": 16,
            "shape": "round"
          }
        },
        {
          "id": "outer-glow",
          "type": "glow",
          "params": {
            "size": 20,
            "color": "#09fdd1",
            "strength": 1.2
          }
        }
      ]
    }
  ]
}
```

---

## Recipe 3: Cyberpunk Hologram with RGB Split & Glitch

A vector polygon emblem afflicted with horizontal slice displacement, rectangular hole blocks, CRT scanlines, and animated chromatic aberration.

```json
{
  "version": 1,
  "document": { "width": 800, "height": 500, "x": 0, "y": 0 },
  "objects": [
    {
      "kind": "shape",
      "id": "cyber-emblem",
      "name": "Glitch Emblem",
      "shape": "polygon",
      "params": {
        "radius": 130,
        "sides": 6,
        "fill": false,
        "stroke": true,
        "strokeColor": "#09fdd1",
        "strokeWidth": 4
      },
      "stack": [
        {
          "id": "slices-glitch",
          "type": "slices",
          "params": {
            "count": 10,
            "shift": 0.12,
            "chance": 0.7,
            "seed": 42
          }
        },
        {
          "id": "rgb-aberration",
          "type": "rgbsplit",
          "params": {
            "mode": "duo",
            "distance": 8,
            "angle": 0
          }
        },
        {
          "id": "crt-scanlines",
          "type": "scanlines",
          "params": {
            "count": 52,
            "width": 2
          }
        },
        {
          "id": "neon-aura",
          "type": "glow",
          "params": {
            "size": 16,
            "color": "#09fdd1",
            "strength": 1.5
          }
        }
      ]
    }
  ],
  "animation": {
    "duration": 2,
    "loop": true,
    "autoplay": true,
    "tracks": [
      {
        "id": "track-rgb-shift",
        "node": "cyber-emblem",
        "on": "modifier",
        "modifier": "rgb-aberration",
        "param": "distance",
        "keys": [
          { "t": 0, "value": 4, "ease": "ease-in-out" },
          { "t": 0.8, "value": 16, "ease": "bounce-out" },
          { "t": 1.2, "value": 2, "ease": "linear" },
          { "t": 2, "value": 4 }
        ]
      }
    ]
  }
}
```

---

## Recipe 4: Organic Fluid Lava Lamp (Metaball)

A group of circles that melt into each other dynamically using polynomial signed-distance fields (`metaball`), styled with a two-tone linear gradient and turbulent edge displacement.

```json
{
  "version": 1,
  "document": { "width": 600, "height": 600, "x": 0, "y": 0 },
  "objects": [
    {
      "kind": "group",
      "id": "lava-cluster",
      "name": "Liquid Blobs",
      "children": [
        {
          "kind": "shape",
          "id": "blob-1",
          "name": "Center Blob",
          "shape": "ellipse",
          "params": { "width": 180, "height": 180, "fillColor": "#ff2a5f" },
          "transform": { "x": 0, "y": 0 }
        },
        {
          "kind": "shape",
          "id": "blob-2",
          "name": "Satellite Blob A",
          "shape": "ellipse",
          "params": { "width": 110, "height": 110, "fillColor": "#ff2a5f" },
          "transform": { "x": -80, "y": -60 }
        },
        {
          "kind": "shape",
          "id": "blob-3",
          "name": "Satellite Blob B",
          "shape": "ellipse",
          "params": { "width": 130, "height": 130, "fillColor": "#ff2a5f" },
          "transform": { "x": 75, "y": 50 }
        }
      ],
      "stack": [
        {
          "id": "metaball-fusion",
          "type": "metaball",
          "params": {
            "reach": 70,
            "grow": 6,
            "quality": 120
          }
        },
        {
          "id": "liquid-gradient",
          "type": "gradient",
          "params": {
            "apply": "fill",
            "kind": "linear",
            "angle": 45,
            "from": "#ff2a5f",
            "to": "#09fdd1"
          }
        },
        {
          "id": "organic-displace",
          "type": "displace",
          "params": {
            "amount": 6,
            "scale": 25,
            "seed": 9
          }
        }
      ]
    }
  ],
  "animation": {
    "duration": 4,
    "loop": true,
    "autoplay": true,
    "tracks": [
      {
        "id": "track-blob2-x",
        "node": "blob-2",
        "on": "node",
        "param": "x",
        "keys": [
          { "t": 0, "value": -80, "ease": "ease-in-out" },
          { "t": 2, "value": 60, "ease": "ease-in-out" },
          { "t": 4, "value": -80 }
        ]
      },
      {
        "id": "track-blob3-y",
        "node": "blob-3",
        "on": "node",
        "param": "y",
        "keys": [
          { "t": 0, "value": 50, "ease": "ease-in-out" },
          { "t": 2, "value": -70, "ease": "ease-in-out" },
          { "t": 4, "value": 50 }
        ]
      }
    ]
  }
}
```

---

## Recipe 5: Mechanical Orbital System (Motion Demo)

Combines effects that follow other objects (Motion and Draw menus):
- A central sun ellipse.
- An orbital path ellipse.
- A comet traveling along the orbit via `followpath`.
- A motion trail following the comet via `trace`.
- A dynamic connection line between the sun and comet with an arrow (`connect`).
- A radar needle continuously tracking the comet via `lookat`.

```json
{
  "version": 1,
  "document": { "width": 800, "height": 600, "x": 0, "y": 0 },
  "objects": [
    {
      "kind": "shape",
      "id": "central-sun",
      "name": "Sun",
      "shape": "ellipse",
      "params": {
        "width": 90,
        "height": 90,
        "fill": true,
        "fillColor": "#ffdd00"
      },
      "transform": { "x": 0, "y": 0 }
    },
    {
      "kind": "shape",
      "id": "orbit-guide",
      "name": "Orbit Path",
      "shape": "ellipse",
      "params": {
        "width": 520,
        "height": 320,
        "fill": false,
        "stroke": true,
        "strokeColor": "#333344",
        "strokeWidth": 1.5,
        "dash": 6,
        "gap": 6
      },
      "transform": { "x": 0, "y": 0 }
    },
    {
      "kind": "shape",
      "id": "gravity-line",
      "name": "Tether",
      "shape": "line",
      "params": {
        "fill": false,
        "stroke": true,
        "strokeColor": "#09fdd1",
        "strokeWidth": 1.5
      },
      "stack": [
        {
          "id": "effect-connect",
          "type": "connect",
          "params": {
            "from": "central-sun",
            "to": "comet",
            "shape": "straight",
            "gap": 10,
            "arrow": "end",
            "arrowSize": 8
          }
        }
      ]
    },
    {
      "kind": "shape",
      "id": "comet-trail",
      "name": "Trail",
      "shape": "line",
      "params": {
        "fill": false,
        "stroke": true,
        "strokeColor": "#ff2a5f",
        "strokeWidth": 3
      },
      "stack": [
        {
          "id": "effect-trace",
          "type": "trace",
          "params": {
            "target": "comet",
            "length": 0.8,
            "samples": 30,
            "smooth": true
          }
        }
      ]
    },
    {
      "kind": "shape",
      "id": "comet",
      "name": "Comet",
      "shape": "star",
      "params": {
        "radius": 18,
        "inner": 0.44,
        "points": 4,
        "fill": true,
        "fillColor": "#ffffff"
      },
      "stack": [
        {
          "id": "orbit-follow",
          "type": "followpath",
          "params": {
            "target": "orbit-guide",
            "position": 0,
            "orient": true
          }
        }
      ]
    },
    {
      "kind": "shape",
      "id": "radar-needle",
      "name": "Radar",
      "shape": "polygon",
      "params": {
        "radius": 24,
        "sides": 3,
        "fill": true,
        "fillColor": "#09fdd1"
      },
      "transform": { "x": -260, "y": -180 },
      "stack": [
        {
          "id": "aim-comet",
          "type": "lookat",
          "params": {
            "target": "comet",
            "facing": -90,
            "amount": 1
          }
        }
      ]
    }
  ],
  "animation": {
    "duration": 6,
    "loop": true,
    "autoplay": true,
    "fps": 30,
    "tracks": [
      {
        "id": "track-comet-orbit",
        "node": "comet",
        "on": "modifier",
        "modifier": "orbit-follow",
        "param": "position",
        "keys": [
          { "t": 0, "value": 0, "ease": "linear" },
          { "t": 6, "value": 1 }
        ]
      }
    ]
  }
}
```

---

## Recipe 6: Risograph Halftone Print with Embossed Bevel

A chess pawn shape rasterized into an ink halftone dot screen with tactile 3D bevel lighting relief and film grain.

```json
{
  "version": 1,
  "document": { "width": 600, "height": 600, "x": 0, "y": 0 },
  "objects": [
    {
      "kind": "shape",
      "id": "halftone-pawn",
      "name": "Risograph Pawn",
      "shape": "pawn",
      "params": {
        "height": 380,
        "fill": true,
        "fillColor": "#09fdd1"
      },
      "transform": { "x": 0, "y": 20 },
      "stack": [
        {
          "id": "ink-halftone",
          "type": "halftone",
          "params": {
            "shape": "circle",
            "spacing": 14,
            "angle": 45,
            "min": 0,
            "max": 0.9,
            "gamma": 1
          }
        },
        {
          "id": "halftone-ink",
          "type": "color",
          "params": {
            "mode": "solid",
            "color": "#0d0d10",
            "target": "fill"
          }
        },
        {
          "id": "bevel-lighting",
          "type": "bevel",
          "params": {
            "depth": 5,
            "height": 4,
            "angle": 45,
            "elevation": 55,
            "shine": 0.5
          }
        },
        {
          "id": "paper-grain",
          "type": "grain",
          "params": {
            "amount": 0.22,
            "size": 1.2,
            "seed": 14
          }
        }
      ]
    }
  ]
}
```

---

## Recipe 7: Physics Toy Box (Drag, Throw, Push, Break and Spawn)

An interactive scene for Play: a handful of rigid bodies fall onto the floor and a fixed ramp, and the pointer
plays with them. Everything lives in one group with **Physics**; each child of that group is a body.

| In Play | What happens | Set by |
| --- | --- | --- |
| Press on a body, move, let go | It is grabbed by that point with a spring and thrown on release | Physics `drag: true` (Drag & throw) |
| Click a body | It is pushed away from the click | Physics `poke` (Click push, px/s) |
| Double-click a body | It breaks into pieces that fly out from its centre | Physics `burst` (pieces) and `burstSpeed` |
| Right-click empty space | A new ball drops in and joins the simulation | A Mouse Instance inside the group (`event: "right-click"`) |
| Resize the window | The walls follow the screen | `fullViewport: "adapt"` with `physicsBounds: true` |

```json
{
  "version": 1,
  "document": {
    "width": 1200,
    "height": 800
  },
  "fullViewport": "adapt",
  "physicsBounds": true,
  "animation": {
    "duration": 10,
    "infinite": true,
    "loop": false,
    "fps": 60,
    "tracks": []
  },
  "notes": "Physics toy box. In Play: drag a body and let go to throw it, click one to push it, double-click one to break it, right-click empty space to drop a new ball. The document edges are walls (they follow the screen with Adapt).",
  "objects": [
    {
      "kind": "group",
      "id": "toys",
      "name": "Toys",
      "stack": [
        {
          "id": "toys-physics",
          "type": "physics",
          "params": {
            "time": {
              "$expr": "scene.time",
              "fallback": 0
            },
            "acceleration": [
              0,
              1400
            ],
            "damping": 0.15,
            "collisions": true,
            "friction": 0.35,
            "bounce": 0.45,
            "drag": true,
            "poke": 700,
            "burst": 6,
            "burstSpeed": 300
          }
        }
      ],
      "children": [
        {
          "kind": "instance",
          "id": "spawner",
          "name": "Right-click spawner",
          "of": "ball-template",
          "stack": [],
          "mouse": {
            "event": "right-click",
            "lifetime": 0,
            "limit": 40,
            "scaleVariation": 0.35
          }
        },
        {
          "kind": "shape",
          "id": "ball",
          "name": "Ball",
          "shape": "ellipse",
          "params": {
            "width": 90,
            "height": 90,
            "fill": true,
            "fillColor": "#ff5a4e",
            "stroke": true,
            "strokeColor": "#1d1a24",
            "strokeWidth": 3
          },
          "transform": {
            "x": -380,
            "y": -260
          },
          "stack": []
        },
        {
          "kind": "shape",
          "id": "crate",
          "name": "Crate",
          "shape": "rectangle",
          "params": {
            "width": 110,
            "height": 110,
            "radius": 10,
            "fill": true,
            "fillColor": "#ffc857",
            "stroke": true,
            "strokeColor": "#1d1a24",
            "strokeWidth": 3
          },
          "transform": {
            "x": -120,
            "y": -300,
            "rotation": 10
          },
          "stack": []
        },
        {
          "kind": "shape",
          "id": "star",
          "name": "Star",
          "shape": "star",
          "params": {
            "radius": 70,
            "inner": 0.5,
            "points": 5,
            "fill": true,
            "fillColor": "#4d8dff",
            "stroke": true,
            "strokeColor": "#1d1a24",
            "strokeWidth": 3
          },
          "transform": {
            "x": 150,
            "y": -280
          },
          "stack": [
            {
              "id": "star-start",
              "type": "rigidbody",
              "params": {
                "velocity": [
                  -180,
                  -320
                ],
                "spin": 240
              }
            }
          ]
        },
        {
          "kind": "shape",
          "id": "hexagon",
          "name": "Hexagon",
          "shape": "polygon",
          "params": {
            "radius": 60,
            "sides": 6,
            "fill": true,
            "fillColor": "#09fdd1",
            "stroke": true,
            "strokeColor": "#1d1a24",
            "strokeWidth": 3
          },
          "transform": {
            "x": 380,
            "y": -250
          },
          "stack": []
        },
        {
          "kind": "shape",
          "id": "ramp",
          "name": "Ramp",
          "shape": "rectangle",
          "params": {
            "width": 520,
            "height": 26,
            "fill": true,
            "fillColor": "#1d1a24"
          },
          "transform": {
            "x": -60,
            "y": 120,
            "rotation": 12
          },
          "stack": [
            {
              "id": "ramp-fixed",
              "type": "rigidbody",
              "params": {
                "immovable": true
              }
            }
          ]
        }
      ]
    },
    {
      "kind": "shape",
      "id": "ball-template",
      "name": "Ball template",
      "shape": "ellipse",
      "params": {
        "width": 56,
        "height": 56,
        "fill": true,
        "fillColor": "#b894f6",
        "stroke": true,
        "strokeColor": "#1d1a24",
        "strokeWidth": 3
      },
      "visible": false,
      "stack": []
    },
    {
      "kind": "shape",
      "id": "table",
      "name": "Table",
      "shape": "rectangle",
      "params": {
        "width": 1200,
        "height": 800,
        "fill": true,
        "fillColor": "#f4efe6"
      },
      "stack": []
    }
  ]
}
```

### How it works

- **One group, one world.** `toys` carries Physics; its children (`ball`, `crate`, `star`, `hexagon`, `ramp`)
  are the bodies. Children can be any closed shapes, SVG objects or text (each letter is a body).
- **Time.** Physics simulates up to its `time`, which follows `scene.time`. With `animation.infinite: true`
  the clock never wraps, so the world keeps running instead of restarting every `duration` seconds.
- **Gravity and air.** `acceleration: [0, 1400]` pulls everything down (px/s², +y is down). `damping` is air
  drag (1/s): 0.15 barely slows a throw; 2 makes bodies glide to a stop.
- **Contacts.** `collisions: true` lets bodies hit each other. `friction` and `bounce` (0–1) apply to every
  contact: bodies with each other, with the ramp and with the walls.
- **Walls.** `physicsBounds: true` turns the document's edges into four static walls for every Physics in the
  scene, so nothing falls out of the frame. With `fullViewport: "adapt"`, Play gives the document the screen's
  shape, so the walls are the screen's edges (`adaptContent`, on by default, scales the content to fit).
- **A fixed obstacle.** The ramp has **Rigid Body** with `immovable: true`: it is part of the world but never
  moves. Any child can be made immovable this way (a floor, a bumper, a funnel).
- **A starting kick.** The star's Rigid Body gives it `velocity` (px/s) and `spin` (°/s) at the start; the
  others start at rest.
- **Spawning.** `spawner` is a Mouse Instance inside the Physics group: every right-click places a copy of
  `ball-template` (hidden, outside the group) where the pointer is, and that copy joins the running world as a
  new body. `lifetime: 0` keeps the copies; `limit: 40` replaces the oldest beyond 40; `scaleVariation` makes
  each ball a different size. Clicks that land on a body are taken by Click push and do not spawn.
- **Background.** `table` sits behind the group (last in `objects`), outside it, so it is not a body.

### Tuning

| Want | Change |
| --- | --- |
| Floaty, no gravity (fridge magnets, air hockey) | `acceleration: [0, 0]`, `damping: 1.5`–`3` |
| Heavier, snappier throws | `acceleration: [0, 2500]`, `damping: 0` |
| Rubber balls | `bounce: 0.85`, `friction: 0.1` |
| Bodies that stick and stack | `bounce: 0.05`, `friction: 0.8` |
| Gentler clicks | `poke: 300` (0 turns Click push off) |
| More shards on a double-click | `burst: 12`, `burstSpeed: 600` (0 turns Burst off) |
| Walls only on the authored document, not the screen | Remove `fullViewport` (or use `"contain"`); the walls stay on the document's edges |
| No walls: things leave the frame | Remove `physicsBounds`; add `clipToDocument: true` to hide what leaves |

### Variations

- **Brush thousands of pieces with the pointer.** Set `collisions: false`, `acceleration: [0, 0]`, `damping: 2.5`
  and `push: 70` (Hover push, px): moving the pointer sweeps every body it passes near, without clicking. Put
  the pieces in the group with a Clone (each copy is a body). Without body-to-body collisions this stays smooth
  with a couple of thousand pieces.
- **Soft bodies.** Add a `softbody` effect to a child (for example the ball) and it squashes and wobbles on
  impact instead of staying rigid; drag still grabs it by the point you press.
- **A hollow arena.** Draw a closed path with a hole (a ring or a frame), make it a child with Rigid Body
  `immovable: true`: Physics keeps holes, so bodies stay inside it. Or point Physics `solids` at objects outside
  the group to use them as fixed obstacles without making them children.
- **A body that pulls the others.** Rigid Body `attractor: true` with `attractionStrength` and
  `attractionRange` turns a child into a magnet for the rest.
- **Spawn on click everywhere.** Change the spawner to `event: "click"`; clicks on bodies still push them,
  clicks on empty space drop balls.

### Things to know

- The pointer gestures (drag, push, burst, spawn, hover push) only exist in Play (the editor's Play button,
  shared links and embedded players). The editor canvas shows the simulation running on its own; headless
  renders and exports have no pointer.
- Editing the scene restarts the simulation; seeking back restores a snapshot of the world.
- Physics needs a group: an object with Physics on its own stack has no children to simulate. In the editor,
  adding Physics to a selection groups it first.
- Gestures are recorded on scene time (`scene.drags`, `scene.pokes`, `scene.bursts`, `scene.sweeps`): they are
  runtime state, never author them in JSON.
