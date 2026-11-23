# Flow Field

`type: "flowfield"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Utils**.

Seeds smooth vector streamlines inside the input silhouette and integrates them through a deterministic noise-driven direction field. Lines stops the field work at a bounded count; Length, Step, Field scale, Curl and Direction shape the paths, and Seed reproduces the same flow.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `lines` | number | `56` | min 1, max 256, step 1 |  |
| `length` | number | `320` | min 20, max 2400, step 1 | unit: px |
| `step` | number | `4` | min 0.5, max 20, step 0.1 | unit: px; not animatable |
| `scale` | number | `3` | min 0.1, max 20, step 0.1 | label: Field scale |
| `curl` | number | `1.2` | min 0, max 2, step 0.01 |  |
| `direction` | angle | `0` | degrees |  |
| `seed` | seed | `1` | integer |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "flowfield-1",
  "type": "flowfield",
  "params": {
    "lines": 56,
    "length": 320,
    "step": 4,
    "scale": 3,
    "curl": 1.2,
    "direction": 0,
    "seed": 1
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
