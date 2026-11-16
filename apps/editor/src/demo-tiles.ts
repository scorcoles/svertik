// Tile Wall demo: a procedural wall of chamfered tiles from a single square. Clone lays it out (2×2 tiles
// packed among small ones, a partial Fill that chips away towards one corner), Range picks random tiles to
// recolour or to turn into dots, and Round Corners (chamfer, random corners) cuts their edges. Every seed
// follows the document's Seed Generator, and the knobs are ranged custom variables (sliders in Document).

const expr = (source: string, fallback: number) => ({ $expr: source, fallback });
const seed = (offset: number) => expr(`scene.seedGenerator + ${offset}`, offset + 1);

/** One Range of random tiles (a share of the elements) wrapping a child effect. */
const pick = (id: string, start: number, end: number, seedOffset: number, child: Record<string, unknown>) => ({
  id, type: 'range', params: { start, end, random: true, seed: seed(seedOffset) }, children: [child],
});

export function tileWallProject() {
  const W = 1200, H = 800;
  return {
    svertik: 'project' as const, version: 1 as const, name: 'Tile Wall', canvas: '#e9e0d1',
    scene: {
      version: 1 as const,
      document: { width: W, height: H },
      seedGenerator: 5,
      custom: {
        cols: { value: 16, min: 4, max: 32, step: 1 },
        rows: { value: 10, min: 2, max: 20, step: 1 },
        big: { value: 0.2, min: 0, max: 0.5, step: 0.01 },
        fill: { value: 0.84, min: 0, max: 1, step: 0.01 },
        gap: { value: 6, min: 0, max: 24, step: 1 },
        chamfer: { value: 16, min: 0, max: 30, step: 1 },
      },
      notes: 'Tile Wall: one square becomes a chipped wall of chamfered tiles. Change the Seed Generator (dice in Document) for a new wall; Variables are the knobs (columns, rows, share of big tiles, fill, gap, chamfer).',
      objects: [
        {
          kind: 'shape' as const,
          id: 'tile',
          name: 'Tile',
          shape: 'rectangle',
          params: { width: 58, height: 58, fill: true, fillColor: '#24467a', stroke: false },
          stack: [
            {
              id: 'wall', type: 'clone', params: {
                mode: 'grid',
                columns: expr('scene.custom.cols', 16), rows: expr('scene.custom.rows', 10),
                packLarge: '2x2', largeRatio: expr('scene.custom.big', 0.2), gridSeed: seed(0), gap: expr('scene.custom.gap', 6),
                fill: expr('scene.custom.fill', 0.84), fillDirection: 0.45, fillAngle: 215, fillSeed: seed(17),
              },
            },
            // Colours: terracotta, ochre and a deep green on part of the tiles; the rest stays blue.
            pick('terracotta', 0, 0.34, 41, { id: 'terracotta-color', type: 'color', params: { mode: 'solid', color: '#d9694c' } }),
            pick('ochre', 0.34, 0.52, 59, { id: 'ochre-color', type: 'color', params: { mode: 'solid', color: '#efb43e' } }),
            pick('green', 0.52, 0.62, 73, { id: 'green-color', type: 'color', params: { mode: 'solid', color: '#1f6f62' } }),
            // A few tiles become dots first (a circle has no corners left to cut), then a chamfer on random corners.
            pick('dots', 0.9, 1, 113, { id: 'dot', type: 'roundcorners', params: { radius: 400, shape: 'round' } }),
            { id: 'chamfer', type: 'roundcorners', params: { radius: expr('scene.custom.chamfer', 16), shape: 'chamfer', corners: 'random', seed: seed(97) } },
          ],
        },
        {
          kind: 'shape' as const,
          id: 'wall-ground',
          name: 'Ground',
          shape: 'rectangle',
          params: { width: W, height: H, fill: true, fillColor: '#efe6d8', stroke: false },
          stack: [],
        },
      ],
    },
  };
}
