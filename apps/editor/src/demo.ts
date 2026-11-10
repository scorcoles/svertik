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

// Tercera demo: una serpiente que repta. Cuerpo, escamas, cabeza, ojos y lengua, en un grupo con Bones
// (6 huesos, con la raíz en la cabeza): cada hueso oscila con un cuarto de vuelta de desfase respecto al
// anterior, así que la onda recorre el cuerpo hacia la cola. La lengua sale y entra. 4 s en bucle.
export function snakeProject() {
  // Oscilación de un hueso: claves cada medio segundo (0, +A, 0, −A…) con curva suave: casi un seno.
  const wave = (amp: number, phase: number) =>
    Array.from({ length: 9 }, (_, i) => {
      const t = i * 0.5;
      const v = Math.round(Math.sin(Math.PI * t - phase) * amp * 100) / 100;
      return { t, value: v, ease: 'ease-in-out' };
    });
  const bone = (k: number, amp: number) => ({ id: `t-bone${k}`, node: 'snake', on: 'modifier', modifier: 'snake-bones', param: `angle${k}`, keys: wave(amp, ((k - 1) * Math.PI) / 2) });
  const tongue = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 22"><path d="M0 9h46l18-9-12 11 12 11-18-9H0z" fill="#ff3b6b"/></svg>';
  return {
    svertik: 'project',
    version: 1,
    name: 'svertik snake',
    canvas: '#0b120e',
    scene: {
      version: 2,
      // Tamaño fijo: la cola barre arriba y abajo, y el encuadre no debe moverse con ella.
      document: { width: 1280, height: 720 },
      objects: [
        {
          kind: 'shape',
          id: 'caption',
          name: 'Caption',
          shape: 'text',
          params: { text: 'BONES', font: 'JetBrains Mono Bold', size: 26, tracking: 700, fillColor: '#2bd67b' },
          transform: { y: 230 },
          stack: [],
        },
        {
          kind: 'group',
          id: 'snake',
          name: 'Snake',
          stack: [
            // La raíz de la cadena, en la cabeza (que apenas se mueve); la onda crece hacia la cola.
            { id: 'snake-bones', type: 'bones', params: { segments: 6, angle1: 0, angle2: 0, angle3: 0, angle4: 0, angle5: 0, angle6: 0, smooth: 1, start: [1, 0.5], end: [0, 0.5] } },
            { id: 'snake-shadow', type: 'shadow', params: { offset: [0, 22], blur: 22, color: '#000000', opacity: 0.55 } },
          ],
          children: [
            // Ojos (delante de todo): el blanco y la pupila, a cada lado de la cabeza.
            { kind: 'shape', id: 'pupil-a', name: 'Pupil', shape: 'ellipse', params: { width: 7, height: 11, fillColor: '#0b120e' }, stack: [], transform: { x: 412, y: -24 } },
            { kind: 'shape', id: 'pupil-b', name: 'Pupil', shape: 'ellipse', params: { width: 7, height: 11, fillColor: '#0b120e' }, stack: [], transform: { x: 412, y: 24 } },
            { kind: 'shape', id: 'eye-a', name: 'Eye', shape: 'ellipse', params: { width: 20, height: 20, fillColor: '#f4ffb0' }, stack: [], transform: { x: 410, y: -24 } },
            { kind: 'shape', id: 'eye-b', name: 'Eye', shape: 'ellipse', params: { width: 20, height: 20, fillColor: '#f4ffb0' }, stack: [], transform: { x: 410, y: 24 } },
            // Escamas: una fila de rombos a lo largo del lomo.
            {
              kind: 'shape',
              id: 'scales',
              name: 'Scales',
              shape: 'polygon',
              params: { radius: 12, sides: 4, rotation: 45, fillColor: '#127a45' },
              // Clone reparte la fila centrada en la pieza: centrada en el cuerpo, sin llegar a la cola.
              stack: [{ id: 'scales-clone', type: 'clone', params: { mode: 'linear', count: 17, offset: [1.6, 0] } }],
              transform: { x: -40 },
            },
            // Cabeza, con un degradado como el cuerpo.
            {
              kind: 'shape',
              id: 'head',
              name: 'Head',
              shape: 'ellipse',
              params: { width: 140, height: 104, fillColor: '#2bd67b' },
              stack: [{ id: 'head-grad', type: 'gradient', params: { from: '#1fa463', to: '#7cf2a8', angle: 90 } }],
              transform: { x: 380 },
            },
            // Cuerpo: una barra larga con los extremos redondeados; la barriga, más clara.
            {
              kind: 'shape',
              id: 'body',
              name: 'Body',
              shape: 'rectangle',
              params: { width: 880, height: 64, radius: 32, fillColor: '#2bd67b' },
              stack: [{ id: 'body-grad', type: 'gradient', params: { from: '#1fa463', to: '#7cf2a8', angle: 90 } }],
              transform: { x: -60 },
            },
            // Lengua (detrás de la cabeza): sale y entra.
            { kind: 'object', id: 'tongue', name: 'Tongue', source: tongue, stack: [], transform: { x: 440 } },
          ],
        },
      ],
      animation: {
        duration: 4,
        fps: 30,
        loop: true,
        tracks: [
          // Onda y media a lo largo del cuerpo: la cabeza casi quieta, la cola, lo que más se mueve.
          bone(1, 8),
          bone(2, 34),
          bone(3, 44),
          bone(4, 46),
          bone(5, 46),
          bone(6, 42),
          {
            id: 't-tongue',
            node: 'tongue',
            on: 'node',
            param: 'x',
            keys: [
              { t: 0, value: 440, ease: 'hold' },
              { t: 1.2, value: 440, ease: 'expo-out' },
              { t: 1.35, value: 490, ease: 'ease-in' },
              { t: 1.6, value: 440, ease: 'hold' },
              { t: 3.1, value: 440, ease: 'expo-out' },
              { t: 3.25, value: 490, ease: 'ease-in' },
              { t: 3.5, value: 440, ease: 'hold' },
              { t: 4, value: 440 },
            ],
          },
        ],
      },
    },
  };
}
