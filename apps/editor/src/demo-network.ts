export function networkProject() {
  const paper = '#10151b';
  const ink = '#e2e7e4';
  const muted = '#9aa8a9';
  const text = (id: string, value: string, y: number, size: number, color: string, tracking = 0) => ({
    kind: 'shape', id, name: value, shape: 'text',
    params: { text: value, font: 'JetBrains Mono', size, weight: 500, tracking, fillColor: color, anchor: 'center' },
    transform: { y }, stack: [],
  });
  return {
    svertik: 'project', version: 1, name: 'Nearest Neighbours · Network study', canvas: paper,
    scene: {
      version: 1, document: { width: 1000, height: 800 },
      notes: 'A node field built from one circle, Clone and Network. Select the object and adjust Clone spacing, then Network neighbours, maximum distance, link colour and width. Replace the source circle with any shape to try other node forms.',
      objects: [
        text('network-kicker', 'GENERATIVE SYSTEMS   /   01', -337, 12, muted, 110),
        { kind: 'shape', id: 'network-nodes', name: 'Nearest-neighbour field', shape: 'ellipse', params: {
          width: 34, height: 34, fill: true, fillColor: '#17303a', stroke: true, strokeColor: '#70d6c9', strokeWidth: 1.5,
          strokeJoin: 'round', strokeCap: 'round', dash: 0, gap: 0, dashOffset: 0, behind: false,
        }, stack: [
          { id: 'network-grid', type: 'clone', enabled: true, params: { mode: 'grid', count: 48, columns: 8, rows: 6, spacing: [2.6, 2.6], packLarge: 'off', largeRatio: 0.16, gridSeed: 1, gap: 12, fill: 1, fillDirection: 0, fillAngle: 90, fillSeed: 1, radius: 1, rings: 1, ringSpacing: 1.1, align: true, startAngle: 0, offset: [1.1, 0], scaleStep: 1, rotateStep: 0, even: false, target: '', place: 'contour', seed: 1, jitter: [0, 0], scaleMin: 1, scaleMax: 1, rotateJitter: 0, variationSeed: 1 } },
          { id: 'network-links', type: 'network', enabled: true, params: { neighbors: 3, maxDistance: 115, gap: 3, color: '#e7b978', width: 1.25 } },
        ], transform: { y: -5 } },
        text('network-title', 'NEAREST NEIGHBOURS', 327, 30, ink, 30),
        text('network-subtitle', '48 NODES   ·   3 LINKS   ·   LOCAL DISTANCE', 365, 11, muted, 80),
        { kind: 'shape', id: 'network-paper', name: 'Background', shape: 'rectangle', params: { width: 1000, height: 800, fill: true, fillColor: paper, stroke: false }, stack: [] },
      ],
    },
  };
}
