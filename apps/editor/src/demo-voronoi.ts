// A vivid geological poster: a gradient field becomes separate, editable Voronoi cells.
export function voronoiProject() {
  const paper = '#f3eddf';
  const ink = '#172a3a';
  const text = (id: string, value: string, y: number, size: number, color: string, weight = 400) => ({
    kind: 'shape', id, name: value, shape: 'text', params: { text: value, font: 'JetBrains Mono', weight, size, tracking: 80, fillColor: color, anchor: 'center' }, transform: { y }, stack: [],
  });
  const objects = [
    text('voronoi-kicker', 'LANDSCAPE STUDY  /  03', -510, 14, ink, 500),
    { kind: 'shape', id: 'voronoi-field', name: 'Tessellated color field', shape: 'ellipse', params: { width: 690, height: 690, fill: true, fillColor: '#ef6c45', stroke: false }, transform: { x: -25, y: -40 }, stack: [
      { id: 'voronoi-gradient', type: 'gradient', params: { kind: 'radial', from: '#f7c95c', to: '#385c82', center: [0.32, 0.3], focus: [0.28, 0.24], radius: 0.83, apply: 'fill' } },
      { id: 'voronoi-cells', type: 'voronoi', params: { spacing: 32, jitter: 0.82, color: 'original', seed: 8 } },
      { id: 'voronoi-rigid-pieces', type: 'rigidpieces', params: { amount: 1, pivot: 's' }, children: [
        { id: 'voronoi-rotate-3d', type: 'rotate3d', enabled: true, params: { rotateX: 12, rotateY: -9, rotateZ: 0, perspective: 2, pivot: [0.5, 0.5] } },
      ] },
      { id: 'voronoi-spherize', type: 'spherize', params: { center: [0.5, 0.44], radius: 0.7, strength: 0.7 } },
    ] },
    { kind: 'shape', id: 'voronoi-orbit', name: 'Orbit', shape: 'ellipse', params: { width: 180, height: 180, fill: false, stroke: true, strokeColor: '#d45b43', strokeWidth: 2 }, transform: { x: 235, y: 200 }, stack: [] },
    text('voronoi-title', 'FAULT LINES', 440, 54, ink, 700),
    text('voronoi-caption', 'SEEDED CELLS  ·  SAMPLED COLOR', 490, 13, '#6e746b'),
    { kind: 'shape', id: 'voronoi-rule', name: 'Rule', shape: 'line', params: { length: 720, angle: 0, stroke: true, strokeColor: '#b8b09e', strokeWidth: 1 }, transform: { y: -475 }, stack: [] },
    { kind: 'shape', id: 'voronoi-frame', name: 'Frame', shape: 'rectangle', params: { width: 850, height: 1050, fill: false, stroke: true, strokeColor: '#b8b09e', strokeWidth: 1 }, stack: [] },
    { kind: 'shape', id: 'voronoi-paper', name: 'Paper', shape: 'rectangle', params: { width: 1000, height: 1200, fill: true, fillColor: paper, stroke: false }, stack: [] },
  ];
  return { svertik: 'project', version: 1, name: 'Fault Lines · Voronoi study', canvas: paper, scene: { version: 1, document: { width: 1000, height: 1200 }, notes: 'A geological color study made from one gradient, Voronoi cells, Rigid Pieces and Spherize. Select Tessellated color field to adjust Cell size, Jitter, Seed or the Spherize field. Each cell moves as a rigid plate.', objects } };
}
