/** A sampled gradient becomes a moving, tone-weighted field of editable scanlines. */
export function waveLinesProject() {
  return {
    svertik: 'project' as const, version: 1 as const, name: 'Wave Lines · Tidal signal', canvas: '#101418',
    scene: {
      version: 1 as const, document: { width: 1200, height: 1400 },
      animation: { duration: 8, loop: true, fps: 30, tracks: [] },
      notes: 'Wave Lines samples the gradient and turns its tone into moving scanlines. Select Tidal signal to tune line spacing, resolution, displacement, wavelength and tone weight. Time is bound to scene.time. Color assigns the palette per line; disable it for the original single ink.',
      objects: [
        { kind: 'shape' as const, id: 'wave-title', name: 'Title', shape: 'text', params: { text: 'TIDAL SIGNAL', font: 'JetBrains Mono', weight: 700, size: 44, tracking: 5, fillColor: '#edf1ee' }, stack: [], transform: { x: 0, y: -560 } },
        { kind: 'shape' as const, id: 'wave-subtitle', name: 'Subtitle', shape: 'text', params: { text: 'TONAL SCANLINES / STUDY 01', font: 'JetBrains Mono', weight: 400, size: 13, tracking: 2, fillColor: '#89979d' }, stack: [], transform: { x: 0, y: -500 } },
        { kind: 'shape' as const, id: 'wave-source', name: 'Tidal signal', shape: 'ellipse', params: { width: 820, height: 820, fill: true, fillColor: '#273042', stroke: false }, stack: [
          { id: 'wave-gradient', type: 'gradient', params: { kind: 'radial', from: '#ffd27a', via: true, viaColor: '#ed766b', to: '#413c78', midpoint: 0.44, center: [0.47, 0.42], radius: 0.72 } },
          { id: 'wave-lines', type: 'wavelines', params: { spacing: 9, resolution: 5, amplitude: 25, wavelength: 210, width: 1.3, weight: 0.9, gamma: 0.9, time: { $expr: 'scene.time', fallback: 0 }, speed: 0.28 } },
          { id: 'wave-palette', type: 'color', params: { mode: 'palette', palette: ['#56dcc7', '#f3c872', '#f18a69', '#c778c9', '#7e91ed'], paletteMode: 'random', seed: 17, target: 'stroke' } },
        ] },
        { kind: 'shape' as const, id: 'wave-caption', name: 'Caption', shape: 'text', params: { text: 'FORM FOLLOWS FREQUENCY', font: 'JetBrains Mono', weight: 400, size: 15, tracking: 3, fillColor: '#a6b2b5' }, stack: [], transform: { x: 0, y: 560 } },
      ],
    },
  };
}
