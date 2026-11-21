/** Three sampled contours combine into a layered modular string-art plate. */
export function stringArtProject() {
  const ring = (id: string, name: string, diameter: number, fill: string, points: number, skip: number, phase: number) => ({
    kind: 'shape' as const, id, name, shape: 'ellipse',
    params: { width: diameter, height: diameter, fill: true, fillColor: fill, stroke: false, strokeColor: fill, strokeWidth: 1.5 },
    stack: [{ id: `${id}-strings`, type: 'stringart', params: { points, skip, phase } }],
  });
  return {
    svertik: 'project' as const, version: 1 as const, name: 'String Art · Modular orbit', canvas: '#101418',
    scene: {
      version: 1 as const, document: { width: 1200, height: 1200 },
      animation: { duration: 4, loop: true, fps: 30, tracks: [] },
      notes: 'A guilloché study built from three editable circle contours. Each String Art effect samples points around its contour and connects them by a fixed modular skip. Select a ring to change Points, Skip or Phase. Coprime point/skip pairs trace one continuous star polygon; other pairs form multiple interlaced loops.',
      objects: [
        { kind: 'shape' as const, id: 'stringart-heading', name: 'Heading', shape: 'text', params: { text: 'MODULAR ORBIT', font: 'JetBrains Mono', weight: 700, size: 38, tracking: 4, fillColor: '#edf1ee' }, transform: { x: 0, y: -475 } },
        ring('stringart-outer', 'Outer · mint', 740, '#4bd7c3', 180, 71, 0),
        ring('stringart-middle', 'Middle · coral', 540, '#f28c55', 144, 55, 17),
        ring('stringart-inner', 'Inner · violet', 340, '#ae91ef', 108, 41, 31),
        { kind: 'shape' as const, id: 'stringart-caption', name: 'Caption', shape: 'text', params: { text: 'POINTS → SKIP → CHORDS', font: 'JetBrains Mono', weight: 400, size: 15, tracking: 2, fillColor: '#9ba9ae' }, transform: { x: 0, y: 475 } },
      ],
    },
  };
}
