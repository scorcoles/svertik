// A print-style topographic study: smooth colour fields under their vector isolines.
export function contourProject() {
  const paper = '#f1ead8';
  const ink = '#173a43';
  const field = (id: string, name: string, x: number, y: number, width: number, height: number, colors: [string, string], contourColor: string, levels: number, spacing: number) => {
    const shape = { shape: 'ellipse', params: { width, height, fill: true, fillColor: colors[0], stroke: false, strokeColor: ink, strokeWidth: 1 } };
    const gradient = { type: 'gradient', params: { kind: 'radial', from: colors[0], to: colors[1], center: [0.42, 0.4], focus: [0.34, 0.33], radius: 0.78, apply: 'fill' } };
    return [
      { kind: 'shape', id: `${id}-contours`, name: `${name} · isolines`, ...shape, transform: { x, y }, stack: [
        { id: `${id}-contour-paint`, ...gradient },
        { id: `${id}-contour-lines`, type: 'contour', params: { spacing, levels, width: 1.25, gamma: 0.85, merge: true } },
        { id: `${id}-contour-ink`, type: 'color', params: { mode: 'solid', color: contourColor, target: 'stroke' } },
      ] },
      { kind: 'shape', id: `${id}-field`, name: `${name} · tone field`, ...shape, transform: { x, y }, stack: [{ id: `${id}-field-paint`, ...gradient }] },
    ];
  };
  const text = (id: string, name: string, value: string, y: number, size: number, color: string, weight = 400, tracking = 0) => ({
    kind: 'shape', id, name, shape: 'text', params: { text: value, font: 'JetBrains Mono', weight, size, tracking, fillColor: color, anchor: 'center' }, transform: { y }, stack: [],
  });
  const objects = [
    text('contour-kicker', 'Kicker', 'FIELD STUDY   /   07', -500, 13, ink, 500, 180),
    { kind: 'shape', id: 'contour-rule', name: 'Rule', shape: 'line', params: { length: 720, angle: 0, stroke: true, strokeColor: '#b8b09e', strokeWidth: 1 }, transform: { y: -470 }, stack: [] },
    ...field('contour-north', 'North basin', -55, -75, 670, 690, ['#f5dc97', '#d85c43'], ink, 12, 5),
    ...field('contour-south', 'South basin', 150, 220, 265, 220, ['#a5d3bd', '#387c83'], '#f6efd9', 7, 4),
    { kind: 'shape', id: 'contour-sun', name: 'Reference point', shape: 'ellipse', params: { width: 12, height: 12, fill: true, fillColor: '#d85c43', stroke: false }, transform: { x: -55, y: -75 }, stack: [] },
    text('contour-title', 'Title', 'ISOBARS', 460, 56, ink, 700, 80),
    text('contour-subtitle', 'Subtitle', 'TONE FIELD   ·   19 LEVELS', 510, 13, '#62736c', 400, 120),
    { kind: 'shape', id: 'contour-frame', name: 'Frame', shape: 'rectangle', params: { width: 850, height: 1050, fill: false, fillColor: paper, stroke: true, strokeColor: '#b8b09e', strokeWidth: 1 }, stack: [] },
    { kind: 'shape', id: 'contour-paper', name: 'Paper', shape: 'rectangle', params: { width: 1000, height: 1200, fill: true, fillColor: paper, stroke: false }, stack: [] },
  ];
  return {
    svertik: 'project', version: 1, name: 'Isobars · contour study', canvas: paper,
    scene: {
      version: 1, document: { width: 1000, height: 1200 },
      notes: 'A topographic poster built from smooth tone fields and vector isolines. Select either “isolines” object to adjust Sample spacing, Levels or Gamma; select its Color effect to change the line ink. The contour geometry is generated from the gradient directly above it in the same stack.',
      objects,
    },
  };
}
