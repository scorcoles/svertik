// La demo del menú: un proyecto pequeño que enseña texto, escalonados, curvas, copias y trazos que se dibujan.
// 6 s en bucle: el círculo se dibuja, los puntos brotan con muelle, el título entra desde el centro,
// el subtítulo llega después y, al final, todo se apaga para volver a empezar.
export function demoProject() {
  const R = 235;
  return {
    svertik: 'project',
    version: 1,
    name: 'svertik demo',
    canvas: '#0d0d10',
    scene: {
      version: 2,
      objects: [
        {
          kind: 'shape',
          id: 'title',
          name: 'Title',
          shape: 'text',
          params: { text: 'svertik', font: 'JetBrains Mono Bold', size: 118, tracking: -10, fillColor: '#f4f4f4' },
          transform: { y: -12 },
          stack: [
            {
              id: 'title-in',
              type: 'stagger',
              params: { progress: 0, direction: 'in', stagger: 0.55, ease: 'back-out', order: 'center' },
              children: [
                { id: 'title-move', type: 'transform', params: { y: 70, rotation: 0, scale: 1 } },
                { id: 'title-fade', type: 'opacity', params: { opacity: 0 } },
              ],
            },
          ],
        },
        {
          kind: 'shape',
          id: 'subtitle',
          name: 'Subtitle',
          shape: 'text',
          params: { text: 'EFFECTS · MOTION · SVG', font: 'JetBrains Mono', size: 15, tracking: 420, fillColor: '#09fdd1' },
          transform: { y: 72 },
          stack: [
            {
              id: 'sub-in',
              type: 'stagger',
              params: { progress: 0, direction: 'in', stagger: 0.85, ease: 'expo-out', order: 'forward' },
              children: [
                { id: 'sub-move', type: 'transform', params: { y: 14, rotation: 0, scale: 1 } },
                { id: 'sub-fade', type: 'opacity', params: { opacity: 0 } },
              ],
            },
          ],
        },
        {
          kind: 'shape',
          id: 'dots',
          name: 'Dots',
          shape: 'ellipse',
          params: { width: 9, height: 9, fillColor: '#09fdd1' },
          stack: [
            { id: 'dots-clone', type: 'clone', params: { mode: 'object', target: 'guide', count: 40, place: 'contour', align: true } },
            { id: 'dots-color', type: 'color', params: { mode: 'gradient', from: '#09fdd1', to: '#8a5cff' } },
            {
              id: 'dots-in',
              type: 'stagger',
              params: { progress: 0, direction: 'in', stagger: 0.9, ease: 'elastic-out', order: 'forward' },
              children: [{ id: 'dots-scale', type: 'transform', params: { x: 0, y: 0, rotation: 0, scale: 0 } }],
            },
          ],
        },
        {
          kind: 'shape',
          id: 'arc',
          name: 'Circle',
          shape: 'ellipse',
          params: { width: R * 2 + 40, height: R * 2 + 40, fill: false, stroke: true, strokeColor: '#3b3b46', strokeWidth: 1.5 },
          stack: [{ id: 'arc-trim', type: 'trim', params: { start: 0, end: 0, offset: 0.25 } }],
        },
        { kind: 'shape', id: 'guide', name: 'Guide', shape: 'ellipse', params: { width: R * 2, height: R * 2, fill: false, stroke: true }, stack: [], visible: false },
      ],
      animation: {
        duration: 6,
        loop: true,
        fps: 30,
        tracks: [
          { id: 'k-arc', node: 'arc', on: 'modifier', modifier: 'arc-trim', param: 'end', keys: [{ t: 0, value: 0, ease: 'ease-in-out' }, { t: 2.2, value: 1 }] },
          { id: 'k-dots', node: 'dots', on: 'modifier', modifier: 'dots-in', param: 'progress', keys: [{ t: 0.4, value: 0, ease: 'linear' }, { t: 3, value: 1 }] },
          { id: 'k-spin', node: 'dots', on: 'node', param: 'rotation', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 6, value: 45 }] },
          { id: 'k-title', node: 'title', on: 'modifier', modifier: 'title-in', param: 'progress', keys: [{ t: 0.9, value: 0, ease: 'linear' }, { t: 2.4, value: 1 }] },
          { id: 'k-sub', node: 'subtitle', on: 'modifier', modifier: 'sub-in', param: 'progress', keys: [{ t: 1.9, value: 0, ease: 'linear' }, { t: 3.4, value: 1 }] },
          // Salida: todo se apaga y el círculo se desdibuja desde su inicio; el bucle vuelve a empezar en negro.
          { id: 'k-arc-out', node: 'arc', on: 'modifier', modifier: 'arc-trim', param: 'start', keys: [{ t: 4.9, value: 0, ease: 'ease-in-out' }, { t: 5.8, value: 1 }] },
          { id: 'k-title-out', node: 'title', on: 'node', param: 'opacity', keys: [{ t: 5, value: 1, ease: 'ease-in' }, { t: 5.7, value: 0 }] },
          { id: 'k-sub-out', node: 'subtitle', on: 'node', param: 'opacity', keys: [{ t: 4.8, value: 1, ease: 'ease-in' }, { t: 5.5, value: 0 }] },
          { id: 'k-dots-out', node: 'dots', on: 'node', param: 'opacity', keys: [{ t: 5.1, value: 1, ease: 'ease-in' }, { t: 5.9, value: 0 }] },
        ],
      },
    },
  };
}

// Segunda demo: un triángulo (punta abajo) entra desde cero, se agrieta, tiembla, estalla con un
// destello y una onda, y sus trozos salen girando. 6 s en bucle.
export function shatterProject() {
  const k = (t: number, value: unknown, ease = 'linear') => ({ t, value, ease });
  return {
    svertik: 'project',
    version: 1,
    name: 'svertik shatter',
    canvas: '#0b0b0e',
    scene: {
      version: 2,
      objects: [
        // Destello del impacto, por delante de todo (casi siempre transparente).
        { kind: 'shape', id: 'flash', name: 'Flash', shape: 'rectangle', params: { width: 1300, height: 860, fillColor: '#ffffff' }, stack: [], opacity: 0 },
        {
          kind: 'shape',
          id: 'caption',
          name: 'Caption',
          shape: 'text',
          params: { text: 'IMPACT', font: 'JetBrains Mono Bold', size: 28, tracking: 700, fillColor: '#09fdd1' },
          transform: { y: 0 },
          stack: [
            {
              id: 'cap-in',
              type: 'stagger',
              params: { progress: 0, direction: 'in', stagger: 0.7, ease: 'expo-out', order: 'center' },
              children: [
                { id: 'cap-move', type: 'transform', params: { y: 18, rotation: 0, scale: 1 } },
                { id: 'cap-fade', type: 'opacity', params: { opacity: 0 } },
              ],
            },
          ],
        },
        // La onda del impacto.
        { kind: 'shape', id: 'wave', name: 'Shockwave', shape: 'ellipse', params: { width: 520, height: 520, fill: false, stroke: true, strokeColor: '#09fdd1', strokeWidth: 3 }, stack: [], opacity: 0 },
        {
          kind: 'shape',
          id: 'tri',
          name: 'Triangle',
          shape: 'polygon',
          params: { sides: 3, radius: 280, rotation: 180, fillColor: '#efefef' },
          transform: { scale: 0 },
          stack: [
            { id: 'tri-damage', type: 'damage', params: { seed: 7, growth: 0, cracks: 6, through: 6, length: 0.7, width: 0.011, chips: 9, chipSize: 0.035, specks: 60, speckSize: 0.006, roughness: 0.55 } },
            { id: 'tri-boom', type: 'explosion', params: { amount: 0, force: 1.1, spin: 260, shrink: 0.3, chaos: 0.75, center: [0.5, 0.42], seed: 3 } },
          ],
        },
        // Marco invisible (del color del lienzo): fija el encuadre aunque los trozos salgan volando.
        { kind: 'shape', id: 'frame', name: 'Frame', shape: 'rectangle', params: { width: 1300, height: 860, fillColor: '#0b0b0e' }, stack: [] },
      ],
      animation: {
        duration: 6,
        loop: true,
        fps: 30,
        tracks: [
          // Entrada: crece con rebote y gira hasta su sitio.
          { id: 's-scale', node: 'tri', on: 'node', param: 'scale', keys: [k(0, 0, 'back-out'), k(0.9, 1)] },
          { id: 's-rot', node: 'tri', on: 'node', param: 'rotation', keys: [k(0, -40, 'expo-out'), k(0.9, 0)] },
          // Se agrieta.
          { id: 's-growth', node: 'tri', on: 'modifier', modifier: 'tri-damage', param: 'growth', keys: [k(0.9, 0, 'ease-in'), k(2.1, 1)] },
          // Tiembla justo antes de romper.
          { id: 's-shake', node: 'tri', on: 'node', param: 'x', keys: [k(1.95, 0), k(2.02, -7), k(2.09, 6), k(2.16, -5), k(2.23, 4), k(2.3, 0)] },
          // Estalla: rápido al principio, luego los trozos siguen a la deriva.
          { id: 's-boom', node: 'tri', on: 'modifier', modifier: 'tri-boom', param: 'amount', keys: [k(2.3, 0, 'expo-out'), k(3, 0.7), k(5.6, 1)] },
          { id: 's-fade', node: 'tri', on: 'node', param: 'opacity', keys: [k(4.9, 1, 'ease-in'), k(5.7, 0)] },
          // Destello y onda.
          { id: 's-flash', node: 'flash', on: 'node', param: 'opacity', keys: [k(2.28, 0), k(2.32, 0.35, 'expo-out'), k(2.75, 0)] },
          { id: 's-wave-scale', node: 'wave', on: 'node', param: 'scale', keys: [k(2.3, 0.2, 'expo-out'), k(3.1, 2.4)] },
          { id: 's-wave-op', node: 'wave', on: 'node', param: 'opacity', keys: [k(2.29, 0), k(2.31, 1, 'ease-out'), k(3.1, 0)] },
          // El rótulo.
          { id: 's-cap', node: 'caption', on: 'modifier', modifier: 'cap-in', param: 'progress', keys: [k(2.9, 0), k(3.8, 1)] },
          { id: 's-cap-out', node: 'caption', on: 'node', param: 'opacity', keys: [k(5, 1, 'ease-in'), k(5.6, 0)] },
        ],
      },
    },
  };
}

// Tercera demo: un «reel» de motion graphics hecho solo con lo que da el motor (primitivas, pilas y
// claves), sin SVG importado ni script. 12 s en bucle, en tres actos sobre un documento de 1280 × 720:
// 1. Morph: un círculo nace, pasa a cuadrado y a estrella, con ráfagas y una onda en cada golpe.
// 2. Clone + Field: una rejilla brota desde el centro, una ola la recorre de ida y vuelta, y estalla.
// 3. Stagger + Range: un rótulo entra letra a letra, una ola lo recorre, parpadea y se va.
export function reelProject() {
  const k = (t: number, value: unknown, ease = 'linear') => ({ t, value, ease });
  const INK = '#f4f4f4', MINT = '#09fdd1', VIOLET = '#8a5cff', CORAL = '#ff6b5e', BG = '#0b0b0e';
  return {
    svertik: 'project',
    version: 1,
    name: 'svertik reel',
    canvas: BG,
    scene: {
      version: 2,
      document: { width: 1280, height: 720 },
      objects: [
        // ── Pie: el acto en curso y una barra que avanza con el bucle.
        { kind: 'shape', id: 'caption', name: 'Caption', shape: 'text', params: { text: '01 / MORPH', font: 'JetBrains Mono', size: 13, tracking: 300, fillColor: '#7a7a88' }, transform: { y: 306 }, stack: [] },
        {
          kind: 'shape', id: 'bar', name: 'Progress', shape: 'line',
          params: { length: 1200, strokeColor: MINT, strokeWidth: 2, strokeCap: 'butt' },
          transform: { y: 332 },
          stack: [{ id: 'bar-trim', type: 'trim', params: { start: 0, end: 0, offset: 0 } }],
        },
        { kind: 'shape', id: 'bar-track', name: 'Progress track', shape: 'line', params: { length: 1200, strokeColor: '#25252d', strokeWidth: 2, strokeCap: 'butt' }, transform: { y: 332 }, stack: [] },

        // ── Acto 3: el rótulo.
        {
          kind: 'shape', id: 'title', name: 'Title', shape: 'text',
          params: { text: 'MOTION', font: 'JetBrains Mono', weight: 700, size: 200, tracking: 0, fillColor: INK },
          transform: { y: -24 },
          stack: [
            {
              id: 'title-in', type: 'stagger',
              params: { progress: 0, direction: 'in', stagger: 0.45, ease: 'back-out', order: 'forward' },
              children: [
                { id: 'title-in-move', type: 'transform', params: { y: 170, rotation: 24, scale: 0.6 } },
                { id: 'title-in-fade', type: 'opacity', params: { opacity: 0 } },
              ],
            },
            {
              id: 'title-wave', type: 'range',
              params: { start: 0, end: 0.45, offset: -0.5, shape: 'smooth' },
              children: [
                { id: 'title-wave-move', type: 'transform', params: { y: -38, scale: 1.08 } },
                { id: 'title-wave-tint', type: 'tint', params: { color: MINT, amount: 1 } },
              ],
            },
            { id: 'title-split', type: 'rgbsplit', params: { distance: 0, angle: 0, colorA: MINT, colorB: CORAL } },
            {
              id: 'title-out', type: 'stagger',
              params: { progress: 0, direction: 'out', stagger: 0.4, ease: 'ease-in', order: 'forward' },
              children: [
                { id: 'title-out-move', type: 'transform', params: { y: -150, rotation: -18, scale: 0.7 } },
                { id: 'title-out-fade', type: 'opacity', params: { opacity: 0 } },
              ],
            },
          ],
        },
        {
          kind: 'shape', id: 'rule', name: 'Rule', shape: 'line',
          params: { length: 716, strokeColor: MINT, strokeWidth: 4, strokeCap: 'butt' },
          transform: { y: 96 },
          stack: [{ id: 'rule-trim', type: 'trim', params: { start: 0, end: 0, offset: 0 } }],
        },
        {
          kind: 'shape', id: 'subtitle', name: 'Subtitle', shape: 'text',
          params: { text: 'SHAPES · MODIFIERS · KEYFRAMES', font: 'JetBrains Mono', size: 17, tracking: 380, fillColor: '#9a9aa8' },
          transform: { y: 132 },
          stack: [
            {
              id: 'sub-in', type: 'stagger',
              params: { progress: 0, direction: 'in', stagger: 0.9, ease: 'expo-out', order: 'forward' },
              children: [
                { id: 'sub-in-move', type: 'transform', params: { y: 14 } },
                { id: 'sub-in-fade', type: 'opacity', params: { opacity: 0 } },
              ],
            },
          ],
        },

        // ── Acto 1: la forma que cambia.
        {
          kind: 'shape', id: 'burst', name: 'Burst', shape: 'line',
          params: { length: 170, angle: -90, strokeColor: MINT, strokeWidth: 3 },
          stack: [
            { id: 'burst-clone', type: 'clone', params: { mode: 'radial', count: 14, radius: 1.15, align: true } },
            { id: 'burst-trim', type: 'trim', params: { start: 0, end: 0, offset: 0 } },
          ],
        },
        { kind: 'shape', id: 'pulse', name: 'Pulse', shape: 'ellipse', params: { width: 200, height: 200, fill: false, stroke: true, strokeColor: INK, strokeWidth: 2 }, stack: [], opacity: 0 },
        {
          kind: 'shape', id: 'core', name: 'Core', shape: 'ellipse',
          params: { width: 180, height: 180, fillColor: MINT },
          stack: [
            { id: 'core-square', type: 'morph', params: { target: 'to-square', amount: 0, points: 200, colors: true, steps: 0 } },
            { id: 'core-star', type: 'morph', params: { target: 'to-star', amount: 0, points: 200, colors: true, steps: 0 } },
            { id: 'core-spin', type: 'transform', params: { x: 0, y: 0, rotation: 0, scale: 0 } },
          ],
        },
        // Los destinos del morph, ocultos.
        { kind: 'shape', id: 'to-square', name: 'To: square', shape: 'rectangle', params: { width: 180, height: 180, radius: 22, fillColor: VIOLET }, stack: [], visible: false },
        { kind: 'shape', id: 'to-star', name: 'To: star', shape: 'star', params: { radius: 132, points: 5, inner: 0.5, fillColor: CORAL }, stack: [], visible: false },

        // ── Acto 2: la rejilla. Las copias van en un grupo: así los campos miden sobre la rejilla entera.
        {
          kind: 'group', id: 'grid', name: 'Grid', opacity: 0,
          stack: [
            // Brota desde el centro: fuera del círculo, las teselas están a escala 0.
            {
              id: 'grid-reveal', type: 'field',
              params: { shape: 'circle', center: [0.5, 0.5], radius: 0.02, softness: 0.5, invert: true },
              children: [{ id: 'grid-reveal-scale', type: 'transform', params: { rotation: -90, scale: 0 } }],
            },
            // La ola: lo que pilla crece, gira y se aclara.
            {
              id: 'grid-wave', type: 'field',
              params: { shape: 'circle', center: [-0.25, 0.25], radius: 0.24, softness: 1 },
              children: [
                { id: 'grid-wave-move', type: 'transform', params: { y: -14, rotation: 90, scale: 1.7 } },
                { id: 'grid-wave-tint', type: 'tint', params: { color: INK, amount: 1 } },
              ],
            },
            { id: 'grid-boom', type: 'explosion', params: { amount: 0, force: 0.3, spin: 200, shrink: 1, chaos: 0.45, center: [0.5, 0.5], seed: 5 } },
          ],
          children: [
            {
              kind: 'shape', id: 'tile', name: 'Tile', shape: 'rectangle',
              params: { width: 44, height: 44, radius: 7, fillColor: MINT },
              stack: [
                { id: 'tile-clone', type: 'clone', params: { mode: 'grid', columns: 12, rows: 5, spacing: [2, 2] } },
                { id: 'tile-color', type: 'color', params: { mode: 'gradient', from: MINT, to: VIOLET } },
              ],
            },
          ],
        },

        // ── Fondo: una trama de puntos, quieta.
        {
          kind: 'shape', id: 'dots', name: 'Dots', shape: 'ellipse',
          params: { width: 3, height: 3, fillColor: '#34343f' },
          stack: [{ id: 'dots-clone', type: 'clone', params: { mode: 'grid', columns: 16, rows: 8, spacing: [26.667, 26.667] } }],
        },
      ],
      animation: {
        duration: 12,
        loop: true,
        fps: 30,
        tracks: [
          // Pie.
          { id: 'r-bar', node: 'bar', on: 'modifier', modifier: 'bar-trim', param: 'end', keys: [k(0, 0), k(12, 1)] },
          { id: 'r-caption', node: 'caption', on: 'shape', param: 'text', keys: [k(0, '01 / MORPH', 'hold'), k(3.15, '02 / CLONE + FIELD', 'hold'), k(6.8, '03 / STAGGER + RANGE')] },

          // Acto 1. Nace con rebote; gira mientras cambia de forma; se encoge para dar paso a la rejilla.
          { id: 'r-core-scale', node: 'core', on: 'modifier', modifier: 'core-spin', param: 'scale', keys: [k(0.15, 0, 'back-out'), k(0.75, 1, 'hold'), k(2.9, 1, 'ease-in'), k(3.2, 0)] },
          { id: 'r-core-rot', node: 'core', on: 'modifier', modifier: 'core-spin', param: 'rotation', keys: [k(1.1, 0, 'ease-in-out'), k(1.7, 90, 'hold'), k(2, 90, 'ease-in-out'), k(2.6, 360, 'hold'), k(2.9, 360, 'ease-in'), k(3.2, 450)] },
          { id: 'r-core-square', node: 'core', on: 'modifier', modifier: 'core-square', param: 'amount', keys: [k(1.1, 0, 'ease-in-out'), k(1.7, 1)] },
          { id: 'r-core-star', node: 'core', on: 'modifier', modifier: 'core-star', param: 'amount', keys: [k(2, 0, 'ease-in-out'), k(2.6, 1)] },
          // Ráfagas: el trazo sale del centro (end) y se consume por detrás (start). Dos veces.
          { id: 'r-burst-end', node: 'burst', on: 'modifier', modifier: 'burst-trim', param: 'end', keys: [k(0.3, 0, 'expo-out'), k(0.9, 1, 'hold'), k(2.5, 0, 'expo-out'), k(3.1, 1)] },
          { id: 'r-burst-start', node: 'burst', on: 'modifier', modifier: 'burst-trim', param: 'start', keys: [k(0.42, 0, 'expo-out'), k(1.15, 1, 'hold'), k(2.5, 0, 'hold'), k(2.62, 0, 'expo-out'), k(3.35, 1)] },
          { id: 'r-burst-turn', node: 'burst', on: 'node', param: 'rotation', keys: [k(0, 0, 'hold'), k(2.5, 12.857)] },
          { id: 'r-burst-color', node: 'burst', on: 'shape', param: 'strokeColor', keys: [k(0, MINT, 'hold'), k(2.5, CORAL)] },
          // La onda, al cerrar el cuadrado.
          { id: 'r-pulse-scale', node: 'pulse', on: 'node', param: 'scale', keys: [k(1.6, 0.7, 'expo-out'), k(2.3, 2.3)] },
          { id: 'r-pulse-op', node: 'pulse', on: 'node', param: 'opacity', keys: [k(1.58, 0, 'hold'), k(1.6, 0.9, 'ease-out'), k(2.3, 0)] },

          // Acto 2.
          { id: 'r-grid-op', node: 'grid', on: 'node', param: 'opacity', keys: [k(0, 0, 'hold'), k(3.1, 1, 'hold'), k(6.25, 1, 'ease-in'), k(6.8, 0)] },
          { id: 'r-grid-reveal', node: 'grid', on: 'modifier', modifier: 'grid-reveal', param: 'radius', keys: [k(3.1, 0.02, 'ease-out'), k(4, 1.1)] },
          { id: 'r-grid-wave', node: 'grid', on: 'modifier', modifier: 'grid-wave', param: 'center', keys: [k(4, [-0.25, 0.25], 'ease-in-out'), k(5, [1.25, 0.5], 'ease-in-out'), k(6, [-0.25, 0.75])] },
          { id: 'r-grid-boom', node: 'grid', on: 'modifier', modifier: 'grid-boom', param: 'amount', keys: [k(6.05, 0, 'expo-out'), k(6.85, 1)] },

          // Acto 3.
          { id: 'r-title-in', node: 'title', on: 'modifier', modifier: 'title-in', param: 'progress', keys: [k(6.8, 0), k(7.8, 1)] },
          { id: 'r-rule-in', node: 'rule', on: 'modifier', modifier: 'rule-trim', param: 'end', keys: [k(7.5, 0, 'expo-out'), k(8.3, 1)] },
          { id: 'r-sub-in', node: 'subtitle', on: 'modifier', modifier: 'sub-in', param: 'progress', keys: [k(7.8, 0), k(8.9, 1)] },
          { id: 'r-title-wave', node: 'title', on: 'modifier', modifier: 'title-wave', param: 'offset', keys: [k(8.3, -0.5, 'ease-in-out'), k(9.5, 1.05)] },
          // Un parpadeo de color antes de irse.
          { id: 'r-title-split', node: 'title', on: 'modifier', modifier: 'title-split', param: 'distance', keys: [k(9.8, 0, 'hold'), k(9.83, 18, 'expo-out'), k(10.3, 0)] },
          { id: 'r-title-out', node: 'title', on: 'modifier', modifier: 'title-out', param: 'progress', keys: [k(10.6, 0), k(11.4, 1)] },
          { id: 'r-rule-out', node: 'rule', on: 'modifier', modifier: 'rule-trim', param: 'start', keys: [k(10.6, 0, 'ease-in-out'), k(11.2, 1)] },
          { id: 'r-sub-out', node: 'subtitle', on: 'node', param: 'opacity', keys: [k(10.5, 1, 'ease-in'), k(11, 0)] },
        ],
      },
    },
  };
}
