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
    text('living-voronoi-kicker', 'FIELD NOTES   /   07', -516, 13, muted, 500),
    text('living-voronoi-title', 'LIVING CELLS', -444, 48, ink, 700),
    text('living-voronoi-subtitle', 'A CONTINUOUS TESSELLATION', -397, 12, muted),
    {
      kind: 'shape', id: 'living-voronoi-field', name: 'Living color field', shape: 'ellipse',
      params: { width: 740, height: 740, fill: true, fillColor: '#f2a65a', stroke: false },
      transform: { x: 0, y: -15 },
      stack: [
        { id: 'living-voronoi-gradient', type: 'gradient', enabled: true, params: { kind: 'radial', from: '#f6d875', to: '#365d78', center: [0.32, 0.27], focus: [0.28, 0.22], radius: 0.94, apply: 'fill' } },
        { id: 'living-voronoi-cells', type: 'voronoi', enabled: true, params: { spacing: 44, jitter: 0.76, color: 'original', seed: 19, drift: 0.45, speed: 0.72, time: { $expr: 'scene.time', fallback: 0 } } },
        { id: 'living-voronoi-rounding', type: 'roundcorners', enabled: true, params: { radius: 52, limit: 180, shape: 'round', corners: 'all', seed: 1 } },
      ],
    },
    { kind: 'shape', id: 'living-voronoi-orbit', name: 'Orbit mark', shape: 'ellipse', params: { width: 128, height: 128, fill: false, stroke: true, strokeColor: '#d45b43', strokeWidth: 2 }, transform: { x: 290, y: 260 }, stack: [] },
    text('living-voronoi-caption', 'DRIFTING SITES   ·   SHARED EDGES   ·   CELL MORPH', 486, 12, muted),
    text('living-voronoi-footnote', 'SEED 19      /      30 FPS      /      VECTOR CELLS', 518, 10, muted),
    { kind: 'shape', id: 'living-voronoi-rule', name: 'Header rule', shape: 'line', params: { length: 760, angle: 0, stroke: true, strokeColor: '#c9c1b2', strokeWidth: 1 }, transform: { y: -548 }, stack: [] },
    { kind: 'shape', id: 'living-voronoi-frame', name: 'Paper frame', shape: 'rectangle', params: { width: 850, height: 1120, fill: false, stroke: true, strokeColor: '#c9c1b2', strokeWidth: 1 }, stack: [] },
    { kind: 'shape', id: 'living-voronoi-paper', name: 'Paper', shape: 'rectangle', params: { width: 1000, height: 1200, fill: true, fillColor: paper, stroke: false }, stack: [] },
  ];
  return {
    svertik: 'project', version: 1, name: 'Living Cells · Voronoi drift', canvas: paper,
    scene: {
      version: 1, document: { width: 1000, height: 1200 },
      notes: 'A looping Voronoi study. Playback moves the cell sites with seeded smooth noise, so each cell visibly changes shape while adjacent cells keep their shared borders. Round Corners softens the angular cell outlines without adding wavy deformation. Select Living color field to tune Cell size, Jitter, Drift and Speed; select Round Corners to adjust the rounding radius. Set Drift to zero for a static layout.',
      objects,
      animation: { duration: 10, loop: true, autoplay: true, fps: 30, tracks: [] },
    },
  };
}
