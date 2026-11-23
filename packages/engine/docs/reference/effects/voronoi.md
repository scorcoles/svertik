# Voronoi

`type: "voronoi"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Generate**.

Turns filled artwork into jittered Voronoi cells, clipped to its silhouette. Cell size controls density; Jitter and Seed shape the tessellation. Gap (2 px by default) leaves an even space between neighbouring cells, so they read even on a flat fill; set it to 0 for a closed tessellation. Cells sample and preserve source colour; use Color or Tint after Voronoi to style them. Optional Drift moves the sites smoothly and recomputes all cells together, keeping their shared borders aligned. Cells remain separate elements for effects such as Step, Color and Physics. Large grids coarsen automatically above about 1,000 sites.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `spacing` | number | `32` | min 8, max 200, step 1 | unit: px; label: Cell size |
| `jitter` | number | `0.8` | min 0, max 1, step 0.01 |  |
| `gap` | number | `2` | min 0, max 60, step 0.5 | unit: px |
| `seed` | seed | `1` | integer |  |
| `drift` | number | `0` | min 0, max 0.5, step 0.01 | fraction of the drawing size; group: Motion |
| `speed` | number | `0.5` | min 0, max 3, step 0.01 | group: Motion |
| `time` | number | `0` | min 0, step 0.01 | unit: s; left out, it follows `scene.time`; group: Motion |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "voronoi-1",
  "type": "voronoi",
  "params": {
    "spacing": 32,
    "jitter": 0.8,
    "gap": 2,
    "seed": 1,
    "drift": 0,
    "speed": 0.5,
    "time": {
      "$expr": "scene.time",
      "fallback": 0
    }
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
