// A looping geology poster whose shared Voronoi borders drift as a continuous field.
export function livingVoronoiProject() {
  const paper = '#f2ecdf';
  const ink = '#172b3b';
  const muted = '#718079';
  const text = (id: string, value: string, y: number, size: number, color: string, weight = 400) => ({
    kind: 'shape', id, name: value, shape: 'text',
    params: { text: value, font: 'JetBrains Mono', weight, size, tracking: 60, align: 'center', fill: true, fillColor: color, stroke: false },
    transform: { y }, stack: [],
  });
  const objects = [
    text('living-voronoi-kicker', 'FIELD STUDY   /   VORONOI 01', -516, 14, muted, 500),
    text('living-voronoi-title', 'LIVING CELLS', -444, 54, ink, 700),
    text('living-voronoi-subtitle', 'SLOW MORPHOLOGY IN A SHARED FIELD', -392, 13, muted),
    {
      kind: 'shape', id: 'living-voronoi-field', name: 'Living color field', shape: 'ellipse',
      params: { width: 740, height: 740, fill: true, fillColor: '#f2a65a', stroke: false },
      transform: { x: 0, y: -15 },
      stack: [
        { id: 'living-voronoi-gradient', type: 'gradient', enabled: true, params: { kind: 'radial', from: '#f6d875', to: '#365d78', center: [0.32, 0.27], focus: [0.28, 0.22], radius: 0.94, apply: 'fill' } },
        { id: 'living-voronoi-cells', type: 'voronoi', enabled: true, params: { spacing: 52, jitter: 0.82, color: 'original', seed: 19, drift: 0.38, speed: 0.55, time: { $expr: 'scene.time', fallback: 0 } } },
        { id: 'living-voronoi-rounding', type: 'roundcorners', enabled: true, params: { radius: 6, limit: 180, shape: 'round', corners: 'all', seed: 1 } },
        { id: 'living-voronoi-mask', type: 'mask', enabled: true, params: { source: 'living-voronoi-boundary', mode: 'shape', whole: false, invert: false } },
      ],
    },
    { kind: 'shape', id: 'living-voronoi-boundary', name: 'Circular field boundary', shape: 'ellipse', visible: false, params: { width: 740, height: 740, fill: true, fillColor: '#ffffff', stroke: false }, transform: { x: 0, y: -15 }, stack: [] },
    text('living-voronoi-caption', 'SLOW SITE DRIFT   ·   SHARED EDGES   ·   ORGANIC MORPH', 486, 12, muted),
    text('living-voronoi-footnote', 'SPACING 52   /   ROUNDING 06   /   SEED 19', 518, 11, muted),
    { kind: 'shape', id: 'living-voronoi-rule', name: 'Header rule', shape: 'line', params: { length: 760, angle: 0, stroke: true, strokeColor: '#c9c1b2', strokeWidth: 1 }, transform: { y: -548 }, stack: [] },
    { kind: 'shape', id: 'living-voronoi-frame', name: 'Paper frame', shape: 'rectangle', params: { width: 850, height: 1120, fill: false, stroke: true, strokeColor: '#c9c1b2', strokeWidth: 1 }, stack: [] },
    { kind: 'shape', id: 'living-voronoi-paper', name: 'Paper', shape: 'rectangle', params: { width: 1000, height: 1200, fill: true, fillColor: paper, stroke: false }, stack: [] },
  ];
  return {
    svertik: 'project', version: 1, name: 'Living Cells · Voronoi drift', canvas: paper,
    scene: {
      version: 1, document: { width: 1000, height: 1200 },
      notes: 'A looping, editorial Voronoi study. Playback moves a fixed set of cell sites with seeded smooth noise, so no edge cells appear or disappear and adjacent cells keep shared borders. Sites stay within the source silhouette; a separate circular Mask gives the field a clean edge. Round Corners uses a deliberately small radius to soften the cells while keeping the tessellation visually connected. Select Living color field to tune Cell size, Jitter, Drift and Speed; select Round Corners to adjust the softness. Set Drift to zero for a static layout.',
      objects,
      animation: { duration: 10, loop: true, autoplay: true, fps: 30, tracks: [] },
    },
  };
}
