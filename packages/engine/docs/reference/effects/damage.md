# Damage

`type: "damage"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Generate**.

Wear: cracks coming in from the edges, chips on the edge and specks, cut as holes. Everything comes from a seed; `growth` makes the cracks advance. Surfaces only.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `seed` | seed | `1` | integer |  |
| `growth` | number | `1` | min 0, max 1, step 0.01 |  |
| `roughness` | number | `0.5` | min 0, max 1, step 0.01 |  |
| `cracks` | number | `3` | min 0, max 12, step 1 | group: Cracks; label: Count |
| `through` | number | `0` | min 0, max 8, step 1 | group: Cracks |
| `length` | number | `0.55` | min 0.05, max 1.5, step 0.01 | fraction of the drawing size; group: Cracks |
| `width` | number | `0.012` | min 0.001, max 0.06, step 0.001 | fraction of the drawing size; group: Cracks |
| `jagged` | number | `0.5` | min 0, max 1, step 0.01 | group: Cracks |
| `taper` | number | `0.75` | min 0, max 1, step 0.01 | group: Cracks |
| `chips` | number | `4` | min 0, max 30, step 1 | group: Chips; label: Count |
| `chipSize` | number | `0.035` | min 0.005, max 0.15, step 0.001 | fraction of the drawing size; group: Chips; label: Size |
| `specks` | number | `30` | min 0, max 300, step 1 | group: Specks; label: Count |
| `speckSize` | number | `0.006` | min 0.001, max 0.03, step 0.001 | fraction of the drawing size; group: Specks; label: Size |
| `edgeBias` | number | `0.7` | min 0, max 1, step 0.01 | group: Specks; label: Near edges |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "damage-1",
  "type": "damage",
  "params": {
    "seed": 1,
    "growth": 1,
    "roughness": 0.5,
    "cracks": 3,
    "through": 0,
    "length": 0.55,
    "width": 0.012,
    "jagged": 0.5,
    "taper": 0.75,
    "chips": 4,
    "chipSize": 0.035,
    "specks": 30,
    "speckSize": 0.006,
    "edgeBias": 0.7
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
