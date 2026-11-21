# Weave

`type: "weave"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Utils**.

At every crossing between open stroked paths, alternates which path passes over and cuts a small gap into the path underneath. Use it on linework such as two cloned grids; it keeps the source elements editable.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `gap` | number | `12` | min 0, max 120, step 0.5 | unit: px |
| `samples` | number | `10` | min 4, max 24, step 1 | not animatable; label: Curve detail |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "weave-1",
  "type": "weave",
  "params": {
    "gap": 12,
    "samples": 10
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
