# Trace

`type: "trace"` · Generator: makes new geometry (copies, pieces, cuts…). · Editor menu: **Utils**.

A trail: the drawing becomes the path another object's center followed during the last `length` seconds of the animation, keeping its style. Shown while playing or scrubbing. Utils → Tracer creates it.

## Parameters

| Param | Type | Default | Range | Notes |
| --- | --- | --- | --- | --- |
| `target` | node | `""` | id of another node | label: Object |
| `length` | number | `1` | min 0.05, max 20, step 0.05 | unit: s |
| `samples` | number | `40` | min 2, max 240, step 1 | not animatable |
| `smooth` | boolean | `true` |  |  |

Missing parameters take their default. Numbers and angles (and points and colours) can be animated with a track `{ on: "modifier", modifier: "<id>", param: "<name>" }` unless noted.

## In a scene

Inside a node's `stack` (effects run top to bottom):

```json
{
  "id": "trace-1",
  "type": "trace",
  "params": {
    "target": "",
    "length": 1,
    "samples": 40,
    "smooth": true
  }
}
```

Generated from the schema of `@svertik/engine`. See [the index](../index.md).
