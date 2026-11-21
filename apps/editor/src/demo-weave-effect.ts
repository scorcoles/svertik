/** A procedural warp-and-weft specimen built from Clone and Weave. */
export function weaveEffectProject() {
  const lattice = (id: string, name: string, vertical: boolean, color: string) => ({
    kind: 'group' as const, id, name,
    stack: [{ id: `${id}-clone`, type: 'clone', params: { mode: 'grid', columns: vertical ? 11 : 1, rows: vertical ? 1 : 11, spacing: [1, 1] } }],
    children: [
      { kind: 'shape' as const, id: `${id}-thread`, name: `${name} thread`, shape: 'line', params: { length: 740, angle: vertical ? 90 : 0, fill: false, stroke: true, strokeColor: color, strokeWidth: 10, strokeCap: 'round' }, stack: [] },
      // A non-painted spacer gives Clone a cell width and height even though a line has zero thickness.
      { kind: 'shape' as const, id: `${id}-cell`, name: `${name} cell`, shape: 'rectangle', params: { width: vertical ? 72 : 740, height: vertical ? 740 : 72, fill: false, stroke: false }, stack: [] },
    ],
  });
  return {
    svertik: 'project' as const, version: 1 as const, name: 'Weave · Over and under', canvas: '#10161b',
    scene: {
      version: 1 as const, document: { width: 1200, height: 1000 },
      animation: { duration: 4, loop: true, fps: 30, tracks: [] },
      notes: 'A procedural vector weave built from two line sources. Clone makes each grid and Weave alternates which strand passes over at every crossing. Adjust Clone spacing and count to reshape the lattice, then adjust Weave Gap for the underpass clearance. The invisible cell shape gives each thin line a spacing footprint; it is cloned with the thread but never painted.',
      objects: [
        { kind: 'shape' as const, id: 'weave-heading', name: 'Heading', shape: 'text', params: { text: 'INTERLACED', font: 'JetBrains Mono', weight: 700, size: 40, tracking: 5, fillColor: '#edf1ee' }, transform: { x: 0, y: -405 } },
        { kind: 'group' as const, id: 'woven-field', name: 'Woven field', transform: { x: 0, y: 35 }, stack: [{ id: 'weave-effect', type: 'weave', params: { gap: 20, samples: 12 } }], children: [
          lattice('warp', 'Warp · copper', true, '#f28c55'),
          lattice('weft', 'Weft · mint', false, '#54d6c3'),
        ] },
        { kind: 'shape' as const, id: 'weave-caption', name: 'Caption', shape: 'text', params: { text: 'WARP / WEFT     —     VECTOR STUDY 01', font: 'JetBrains Mono', weight: 400, size: 15, tracking: 2, fillColor: '#9ba9ae' }, transform: { x: 0, y: 435 } },
      ],
    },
  };
}
