// Weave demo: a breathing woven grid from two objects. One bar is cloned into a row (verticals) and another
// into a column (horizontals); Gather squeezes each one towards opposite sides at its two edges, so the
// gaps drift in diagonal moiré bands. The squeeze swings with time (out of phase between both layers), and
// the knobs are ranged custom variables (sliders in Document). Bars are strokes, so Gather keeps their width.

const expr = (source: string, fallback: number) => ({ $expr: source, fallback });

/** One layer of bars: `axis` x gives verticals (a row), y gives horizontals (a column). */
function bars(id: string, name: string, axis: 'x' | 'y', color: string, phase: number) {
  const length = expr('scene.custom.size + 2 * scene.custom.over', 1032);
  const pitch = expr('scene.custom.size / (scene.custom.n - 1)', 25.6);
  const count = expr('scene.custom.n', 40);
  // Squeeze: swings between ±warp over the loop; `phase` shifts the two layers so the bands travel.
  const swing = `scene.custom.warp * sin(2 * pi * scene.progress + ${phase})`;
  const vertical = axis === 'x';
  return {
    kind: 'shape' as const,
    id,
    name,
    shape: 'rectangle',
    params: {
      width: vertical ? 1 : length, height: vertical ? length : 1,
      fill: true, fillColor: color,
      stroke: true, strokeColor: color, strokeWidth: expr('scene.custom.bar - 1', 12), strokeJoin: 'miter', strokeCap: 'butt',
    },
    stack: [
      {
        id: `${id}-clone`, type: 'clone', params: {
          mode: 'grid', columns: vertical ? count : 1, rows: vertical ? 1 : count,
          spacing: vertical ? [pitch, 1] : [1, pitch],
        },
      },
      { id: `${id}-gather`, type: 'gather', params: { axis, start: expr(swing, 0.45), end: expr(`-(${swing})`, -0.45) } },
    ],
  };
}

export function weaveProject() {
  return {
    svertik: 'project' as const, version: 1 as const, name: 'Weave', canvas: '#ece6da',
    scene: {
      version: 1 as const,
      document: { width: 1200, height: 1200 },
      animation: { duration: 8, loop: true, fps: 30, tracks: [] },
      custom: {
        n: { value: 40, min: 4, max: 120, step: 1 },
        warp: { value: 0.55, min: 0, max: 0.95, step: 0.01 },
        bar: { value: 13, min: 2, max: 30, step: 0.5 },
        over: { value: 16, min: 0, max: 60, step: 1 },
        size: { value: 1000, min: 200, max: 1100, step: 10 },
      },
      notes: 'Weave: two cloned bars (a row of verticals, a column of horizontals) squeezed by Gather towards opposite sides at each edge, so the gaps drift in diagonal moiré bands. The squeeze swings over the 8 s loop, out of phase between the layers. Knobs: n (bars), warp (squeeze), bar (thickness), over (overshoot), size.',
      objects: [
        bars('horizontals', 'Horizontals', 'y', '#c8402c', 1.2),
        bars('verticals', 'Verticals', 'x', '#1d1d1f', 0),
      ],
    },
  };
}
