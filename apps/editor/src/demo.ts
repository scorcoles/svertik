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
          params: { text: 'IMPACT', font: 'JetBrains Mono Bold', size: 22, tracking: 700, fillColor: '#09fdd1' },
          transform: { y: 360 },
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
