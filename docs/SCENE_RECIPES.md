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

## Recipe 5: Mechanical Orbital System (Utils Demo)

Combines the **Utils** node and effect family:
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
