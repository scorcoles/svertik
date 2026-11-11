# Field

`type: "field"` · Effector: acts per element (letters, copies, pieces…), usually through nested effects. · Editor menu: **Effect**.

Field selector: the nested effects act more or less on each element depending on where its centre is relative to a shape (circle, plane or box). Move the field to sweep the drawing; Softness is how much of the edge is a transition.

Takes nested effects (`children`), weighted per element by its position. Nested effectors are not allowed.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `shape` | enum | `"circle"` | `circle`, `linear`, `box` | not animatable |
| `center` | point | `[0.5,0.5]` | [x, y], fractions of the box (0–1) |  |
| `radius` | number | `0.35` | min 0.01, max 2, step 0.01 | fraction of the drawing size |
| `softness` | number | `0.5` | min 0, max 1, step 0.01 |  |
| `angle` | angle | `0` | degrees |  |
| `invert` | boolean | `false` |  | not animatable |
| `amount` | number | `1` | min 0, max 1, step 0.01 |  |
| `unit` | enum | `"elements"` | `elements`, `words`, `lines` | not animatable |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "field-1",
  "type": "field",
  "params": {
    "shape": "circle",
    "center": [
      0.5,
      0.5
    ],
    "radius": 0.35,
    "softness": 0.5,
    "angle": 0,
    "invert": false,
    "amount": 1,
    "unit": "elements"
  },
  "children": [
    {
      "id": "twist-1",
      "type": "twist",
      "params": {
        "angle": 30
      }
    }
  ]
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
