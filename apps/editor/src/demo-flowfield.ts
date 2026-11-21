/** Seeded streamlines fill one silhouette, then Color assigns a palette per path. */
export function flowFieldProject() {
  return {
    svertik: 'project' as const, version: 1 as const, name: 'Flow Field · Thermal currents', canvas: '#101418',
    scene: {
      version: 1 as const, document: { width: 1200, height: 1200 },
      animation: { duration: 4, loop: true, fps: 30, tracks: [] },
      notes: 'Seeded streamlines integrate through a smooth vector field and stop at the source ellipse boundary. Select Thermal currents to tune Lines, Length, Step, Field scale, Curl, Direction or Seed. Color assigns the five-ink palette to individual paths; disable it to use the source ink.',
      objects: [
        { kind: 'shape' as const, id: 'flow-title', name: 'Title', shape: 'text', params: { text: 'THERMAL CURRENTS', font: 'JetBrains Mono', weight: 700, size: 34, tracking: 3, fillColor: '#edf1ee' }, transform: { x: 0, y: -480 } },
        { kind: 'shape' as const, id: 'flow-field', name: 'Thermal currents', shape: 'ellipse', params: { width: 780, height: 780, fill: true, fillColor: '#54d6c3', stroke: false }, stack: [
          { id: 'flow-lines', type: 'flowfield', params: { lines: 112, length: 530, step: 4, scale: 2.8, curl: 1.25, direction: -90, seed: 17 } },
          { id: 'flow-ink', type: 'color', params: { mode: 'palette', palette: ['#55d7c3', '#f3bd58', '#f28c55', '#dd6b9a', '#7889ed'], paletteMode: 'random', seed: 23, target: 'stroke' } },
        ] },
        { kind: 'shape' as const, id: 'flow-caption', name: 'Caption', shape: 'text', params: { text: 'A SEEDED VECTOR FIELD   /   112 STREAMLINES', font: 'JetBrains Mono', weight: 400, size: 14, tracking: 2, fillColor: '#9ba9ae' }, transform: { x: 0, y: 480 } },
      ],
    },
  };
}
