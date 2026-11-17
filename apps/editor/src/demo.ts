import { type SceneNode, type SceneV1, type Track } from '@svertik/engine';
import physicsSource from './demo-physics.json?raw';

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
      version: 1,
      objects: [
        {
          kind: 'shape',
          id: 'title',
          name: 'Title',
          shape: 'text',
          params: { text: 'svertik', font: 'JetBrains Mono', weight: 700, size: 118, tracking: -10, fillColor: '#f4f4f4' },
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
      version: 1,
      objects: [
        // Destello del impacto, por delante de todo (casi siempre transparente).
        { kind: 'shape', id: 'flash', name: 'Flash', shape: 'rectangle', params: { width: 1300, height: 860, fillColor: '#ffffff' }, stack: [], opacity: 0 },
        {
          kind: 'shape',
          id: 'caption',
          name: 'Caption',
          shape: 'text',
          params: { text: 'IMPACT', font: 'JetBrains Mono', weight: 700, size: 28, tracking: 700, fillColor: '#09fdd1' },
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
// Usa también pistas que se repiten (las ráfagas), un efecto que se enciende y apaga (el RGB Split),
// curvas «in» (la salida del rótulo) y texto con ancla (el pie no salta al cambiar de acto).
export function reelProject() {
  const k = (t: number, value: unknown, ease = 'linear') => ({ t, value, ease });
  const INK = '#f4f4f4', MINT = '#09fdd1', VIOLET = '#8a5cff', CORAL = '#ff6b5e', BG = '#0b0b0e';
  return {
    svertik: 'project',
    version: 1,
    name: 'svertik reel',
    canvas: BG,
    scene: {
      version: 1,
      document: { width: 1280, height: 720 },
      objects: [
        // ── Pie: el acto en curso y una barra que avanza con el bucle.
        { kind: 'shape', id: 'caption', name: 'Caption', shape: 'text', params: { text: '01 / MORPH', font: 'JetBrains Mono', size: 13, tracking: 300, fillColor: '#7a7a88', anchor: 'center' }, transform: { y: 306 }, stack: [] },
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
            { id: 'title-split', type: 'rgbsplit', enabled: false, params: { distance: 18, angle: 0, colorA: MINT, colorB: CORAL } },
            {
              id: 'title-out', type: 'stagger',
              params: { progress: 0, direction: 'out', stagger: 0.4, ease: 'back-in', order: 'forward' },
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

        // ── Acto 2: la rejilla. Detrás del Clone, los campos miden sobre la rejilla entera.
        {
          kind: 'shape', id: 'grid', name: 'Grid', shape: 'rectangle', opacity: 0,
          params: { width: 44, height: 44, radius: 7, fillColor: MINT },
          stack: [
            { id: 'grid-clone', type: 'clone', params: { mode: 'grid', columns: 12, rows: 5, spacing: [2, 2] } },
            { id: 'grid-color', type: 'color', params: { mode: 'gradient', from: MINT, to: VIOLET } },
            // Brota desde el centro: fuera del círculo, las teselas están a escala 0.
            {
              id: 'grid-reveal', type: 'field',
              params: { shape: 'circle', center: [0.5, 0.5], width: 0.04, height: 0.04, softness: 0.5, invert: true },
              children: [{ id: 'grid-reveal-scale', type: 'transform', params: { rotation: -90, scale: 0 } }],
            },
            // La ola: lo que pilla crece, gira y se aclara.
            {
              id: 'grid-wave', type: 'field',
              params: { shape: 'circle', center: [-0.25, 0.25], width: 0.48, height: 0.48, softness: 1 },
              children: [
                { id: 'grid-wave-move', type: 'transform', params: { y: -14, rotation: 90, scale: 1.7 } },
                { id: 'grid-wave-tint', type: 'tint', params: { color: INK, amount: 1 } },
              ],
            },
            { id: 'grid-boom', type: 'explosion', params: { amount: 0, force: 0.3, spin: 200, shrink: 1, chaos: 0.45, center: [0.5, 0.5], seed: 5 } },
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
          // Ráfagas: el trazo sale del centro (end) y se consume por detrás (start). Dos veces, cada 2,2 s.
          { id: 'r-burst-end', node: 'burst', on: 'modifier', modifier: 'burst-trim', param: 'end', keys: [k(0.3, 0, 'expo-out'), k(0.9, 1)], repeat: 2, every: 2.2 },
          { id: 'r-burst-start', node: 'burst', on: 'modifier', modifier: 'burst-trim', param: 'start', keys: [k(0.42, 0, 'expo-out'), k(1.15, 1)], repeat: 2, every: 2.2 },
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
          // Un parpadeo de color antes de irse: el RGB Split solo está encendido mientras dura.
          { id: 'r-title-split-on', node: 'title', on: 'modifier', modifier: 'title-split', param: 'enabled', keys: [k(0, false, 'hold'), k(9.8, true, 'hold'), k(10.3, false)] },
          { id: 'r-title-split', node: 'title', on: 'modifier', modifier: 'title-split', param: 'distance', keys: [k(9.8, 18, 'expo-out'), k(10.3, 0)] },
          { id: 'r-title-out', node: 'title', on: 'modifier', modifier: 'title-out', param: 'progress', keys: [k(10.6, 0), k(11.4, 1)] },
          { id: 'r-rule-out', node: 'rule', on: 'modifier', modifier: 'rule-trim', param: 'start', keys: [k(10.6, 0, 'ease-in-out'), k(11.2, 1)] },
          { id: 'r-sub-out', node: 'subtitle', on: 'node', param: 'opacity', keys: [k(10.5, 1, 'ease-in'), k(11, 0)] },
        ],
      },
    },
  };
}

// Cuarta demo, «Orbit»: las herramientas de Utils juntas. Un cometa da la vuelta a una órbita (Follow Path)
// dejando su estela (Tracer); un hilo lo une al sol (Connector), un sol de gotas al que se acerca y se funde
// una luna (Metaball); cuatro agujas lo siguen con la mirada (una pieza y tres Instances, giradas por un
// Effector con Look At); el marco, con las esquinas redondeadas (Round Corners). 6 s en bucle.
export function orbitProject() {
  const INK = '#f4f4f4', CYAN = '#09fdd1', PINK = '#ff4fa3', DIM = '#2c2c36';
  const needle = { points: 2, radius: 30, inner: 0.16, rotation: 90, fillColor: INK };
  return {
    svertik: 'project',
    version: 1,
    name: 'orbit',
    canvas: '#0d0d10',
    scene: {
      version: 1,
      document: { width: 960, height: 540 },
      objects: [
        {
          kind: 'shape', id: 'caption', name: 'Caption', shape: 'text',
          params: { text: 'INSTANCE · EFFECTOR · METABALL · FOLLOW PATH · TRACER · CONNECTOR · LOOK AT', font: 'JetBrains Mono', size: 10, tracking: 220, fillColor: '#6a6a78', anchor: 'center' },
          transform: { y: 238 }, stack: [],
        },
        {
          kind: 'shape', id: 'comet', name: 'Comet', shape: 'ellipse', params: { width: 22, height: 22, fillColor: CYAN },
          stack: [{ id: 'comet-path', type: 'followpath', params: { target: 'orbit', position: 0, orient: false } }],
        },
        {
          kind: 'shape', id: 'trail', name: 'Comet trace', shape: 'line', params: { strokeColor: CYAN, strokeWidth: 3 }, opacity: 0.55,
          stack: [{ id: 'trail-trace', type: 'trace', params: { target: 'comet', length: 1.4, samples: 60, smooth: true } }],
        },
        {
          kind: 'shape', id: 'tether', name: 'Connector', shape: 'line', params: { strokeColor: '#4a4a58', strokeWidth: 1.5 },
          stack: [{ id: 'tether-connect', type: 'connect', params: { from: 'core', to: 'comet', shape: 'straight', edges: true, gap: 8 } }],
        },
        { kind: 'shape', id: 'w1', name: 'Watcher', shape: 'star', params: needle, transform: { x: -390, y: -200 }, stack: [] },
        { kind: 'instance', id: 'w2', name: 'Watcher instance', of: 'w1', transform: { x: 390, y: -200 }, stack: [] },
        { kind: 'instance', id: 'w3', name: 'Watcher instance 2', of: 'w1', transform: { x: -390, y: 200 }, stack: [] },
        { kind: 'instance', id: 'w4', name: 'Watcher instance 3', of: 'w1', transform: { x: 390, y: 200 }, stack: [] },
        {
          kind: 'effector', id: 'gaze', name: 'Effector', targets: ['w1', 'w2', 'w3', 'w4'],
          stack: [{ id: 'gaze-look', type: 'lookat', params: { target: 'comet', facing: 0, amount: 1 } }],
        },
        {
          kind: 'group', id: 'core', name: 'Sun',
          stack: [{ id: 'core-goo', type: 'metaball', params: { reach: 34, grow: 0 } }],
          children: [
            { kind: 'shape', id: 'moon', name: 'Moon', shape: 'ellipse', params: { width: 34, height: 34, fillColor: PINK }, transform: { x: 110, y: -20 }, stack: [] },
            { kind: 'shape', id: 'sun', name: 'Sun', shape: 'ellipse', params: { width: 96, height: 96, fillColor: PINK }, stack: [] },
          ],
        },
        { kind: 'shape', id: 'orbit', name: 'Orbit', shape: 'ellipse', params: { width: 600, height: 300, fill: false, stroke: true, strokeColor: DIM, strokeWidth: 1.5 }, transform: { rotation: -12 }, stack: [] },
        {
          kind: 'shape', id: 'frame', name: 'Frame', shape: 'rectangle', params: { width: 920, height: 500, fill: false, stroke: true, strokeColor: DIM, strokeWidth: 1.5 },
          stack: [{ id: 'frame-round', type: 'roundcorners', params: { radius: 28 } }],
        },
      ],
      animation: {
        duration: 6,
        loop: true,
        fps: 30,
        tracks: [
          { id: 'k-comet', node: 'comet', on: 'modifier', modifier: 'comet-path', param: 'position', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 6, value: 1 }] },
          // La luna se acerca, se funde con el sol y se vuelve a separar.
          { id: 'k-moon-x', node: 'moon', on: 'node', param: 'x', keys: [{ t: 0, value: 110, ease: 'ease-in-out' }, { t: 3, value: 48, ease: 'ease-in-out' }, { t: 6, value: 110 }] },
          { id: 'k-moon-y', node: 'moon', on: 'node', param: 'y', keys: [{ t: 0, value: -20, ease: 'ease-in-out' }, { t: 3, value: 26, ease: 'ease-in-out' }, { t: 6, value: -20 }] },
        ],
      },
    },
  };
}

// Quinta demo, «Pointer»: se abre en Play y el dibujo sigue al ratón (o al dedo). Una rejilla de puntos
// que crecen y se encienden alrededor del puntero (un Field que lo sigue), un aro que lo persigue con
// inercia y dos agujas que miran al aro (Look At). Sin línea de tiempo: solo interacciones «pointer».
export function pointerProject() {
  const INK = '#f4f4f4', CYAN = '#09fdd1', DIM = '#34343f';
  const needle = { points: 2, radius: 34, inner: 0.16, rotation: 90, fillColor: INK };
  return {
    svertik: 'project',
    version: 1,
    name: 'pointer',
    canvas: '#0d0d10',
    scene: {
      version: 1,
      document: { width: 960, height: 540 },
      objects: [
        {
          kind: 'shape', id: 'hint', name: 'Hint', shape: 'text',
          params: { text: 'MOVE THE POINTER', font: 'JetBrains Mono', size: 11, tracking: 420, fillColor: '#6a6a78', anchor: 'center' },
          transform: { y: 246 }, stack: [],
        },
        {
          kind: 'shape', id: 'ring', name: 'Ring', shape: 'ellipse', params: { width: 64, height: 64, fill: false, stroke: true, strokeColor: CYAN, strokeWidth: 2 },
          transform: { x: 0, y: 0 }, stack: [],
        },
        { kind: 'shape', id: 'n1', name: 'Needle', shape: 'star', params: needle, transform: { x: -400, y: 220 }, stack: [{ id: 'n1-look', type: 'lookat', params: { target: 'ring', facing: 0, amount: 1 } }] },
        { kind: 'shape', id: 'n2', name: 'Needle 2', shape: 'star', params: needle, transform: { x: 400, y: 220 }, stack: [{ id: 'n2-look', type: 'lookat', params: { target: 'ring', facing: 0, amount: 1 } }] },
        {
          kind: 'shape', id: 'dots', name: 'Dots', shape: 'ellipse', params: { width: 8, height: 8, fillColor: DIM },
          transform: { y: -14 },
          stack: [
            { id: 'dots-grid', type: 'clone', params: { mode: 'grid', columns: 22, rows: 11, spacing: [5, 5] } },
            {
              id: 'dots-field', type: 'field', params: { shape: 'circle', center: [0.5, 0.5], width: 0.4, height: 0.4, softness: 1, amount: 1 },
              children: [
                { id: 'dots-grow', type: 'transform', params: { scale: 3.2 } },
                { id: 'dots-tint', type: 'tint', params: { color: CYAN, amount: 1 } },
              ],
            },
          ],
        },
      ],
      interactions: [
        { id: 'follow-field', node: 'dots', trigger: 'pointer', action: 'follow', target: { node: 'dots', on: 'modifier', modifier: 'dots-field', param: 'center' }, to: null, duration: 0.1, axis: 'both' },
        { id: 'follow-ring', node: 'ring', trigger: 'pointer', action: 'follow', target: { node: 'ring', on: 'node', param: 'position' }, to: null, duration: 0.3, axis: 'both' },
      ],
    },
  };
}

/** A centred terracotta circle: five through cuts, an explosive burst, then rigid-body gravity. */
export function gravityProject() {
  return {
    svertik: 'project',
    version: 1,
    name: 'Gravity · círculo fragmentado',
    canvas: '#F2E8DA',
    scene: {
      version: 1,
      document: { width: 1280, height: 900 },
      notes: 'Círculo centrado en un canvas de 1280×900, de color #D2502F. Damage con cinco cortes Through, seguido de Explosion y Gravity con cuerpos rígidos. Al inicio el círculo está centrado; los cortes crecen entre 0.4 y 1.1 s, recibe el impulso de Explosion entre 1.2 y 1.24 s y Gravity integra la velocidad de salida y el giro desde 1.2 s. Explosión muy enérgica (fuerza 3, giro 900°/s), con dispersión amplia: muchas piezas salen deliberadamente del encuadre y conservan su inercia. El suelo virtual queda en Y=378. Selecciona Gravity para mover o girar el suelo. Usa los controles inferiores para reproducir sin abrir el timeline. Las piezas colisionan con el suelo, no entre sí. BOOM aparece detrás de los fragmentos, en mayúsculas y del mismo color #D2502F, con una entrada casi simultánea muy rápida, de 1.26 a 1.44 s, y un pequeño rebote. Queda grande y centrado (tamaño de texto 400 px). Circle hace una pequeña anticipación de escala antes de estallar (0.94 → 1.06 → 1), con retorno suave a escala normal hasta 1.42 s. Confetti emite una ráfaga de 200 partículas de #D2502F al estallar, con giro rápido, caída y desvanecimiento; se oculta antes de 1.2 s.',
      objects: [
        {
          kind: 'shape',
          id: 'gravity-circle',
          name: 'Circle',
          shape: 'ellipse',
          params: { width: 420, height: 420, fill: true, fillColor: '#D2502F', stroke: false },
          transform: { x: 0, y: 0 },
          stack: [
            {
              id: 'gravity-circle-damage',
              type: 'damage',
              params: {
                seed: 12,
                growth: { $expr: 'clamp((scene.time - 0.4) / 0.7, 0, 1)', fallback: 0 },
                through: 5, cracks: 5, width: 0.007, jagged: 0.45,
                roughness: 0.25, chips: 0, specks: 0,
              },
            },
            {
              id: 'gravity-circle-explosion',
              type: 'explosion',
              params: {
                motion: 'impulse',
                amount: { $expr: 'clamp((scene.time - 1.2) / 0.04, 0, 1)', fallback: 0 },
                force: 3, spin: 900, shrink: 0, chaos: 0.8, seed: 7, center: [0.5, 0.5],
              },
            },
            {
              id: 'gravity-circle-gravity',
              type: 'gravity',
              params: {
                time: { $expr: 'max(0, scene.time - 1.2)', fallback: 0 },
                gravity: 1.6, floor: [0.5, 1.4], rotation: 0,
                physics: true, friction: 0.55, bounce: 0.35,
              },
            },
          ],
        },
        {
          kind: 'shape',
          id: 'gravity-confetti',
          name: 'Confetti',
          shape: 'rectangle',
          params: { width: 420, height: 147, fill: true, fillColor: '#D2502F', stroke: false },
          transform: { x: 0, y: 0 },
          stack: [
            {
              id: 'gravity-confetti-particles',
              type: 'particles',
              params: {
                time: { $expr: 'max(0, scene.time - 1.2)', fallback: 0 },
                emission: 'burst', count: 200, lifetime: 3.4,
                emitter: 'point', center: [0.5, 0.5], motion: 'free',
                direction: -90, spread: 260, speed: 2.1, speedRandom: 0.55,
                spin: 650, gravity: 1.2, size: 0.03, sizeRandom: 0.55,
                fade: 0.35, seed: 23,
              },
            },
            {
              id: 'gravity-confetti-reveal',
              type: 'opacity',
              params: { opacity: { $expr: 'clamp((scene.time - 1.2) / 0.035, 0, 1)', fallback: 0 } },
            },
          ],
        },
        {
          kind: 'shape',
          id: 'gravity-boom',
          name: 'Boom',
          shape: 'text',
          params: { text: 'BOOM', font: 'JetBrains Mono', weight: 700, size: 400, tracking: -45, align: 'center', fill: true, fillColor: '#D2502F', stroke: false },
          transform: { x: 0, y: 0 },
          stack: [
            {
              id: 'gravity-boom-entrance',
              type: 'stagger',
              params: {
                progress: { $expr: 'clamp((scene.time - 1.26) / 0.18, 0, 1)', fallback: 0 },
                direction: 'in', stagger: 0.06, ease: 'back-out', order: 'forward',
              },
              children: [
                { id: 'gravity-boom-rise', type: 'transform', params: { y: 25, rotation: -5, scale: 0.5 } },
                { id: 'gravity-boom-fade', type: 'opacity', params: { opacity: 0 } },
              ],
            },
          ],
        },
      ],
      animation: {
        duration: 8, fps: 30, loop: true, autoplay: true,
        tracks: [{
          id: 'gravity-circle-anticipation', node: 'gravity-circle', on: 'node', param: 'scale',
          keys: [
            { t: 0, value: 1, ease: 'linear' },
            { t: 0.78, value: 1, ease: 'ease-in' },
            { t: 1.04, value: 0.94, ease: 'ease-out' },
            { t: 1.17, value: 1.06, ease: 'ease-in-out' },
            { t: 1.42, value: 1 },
          ],
        }],
      },
    },
  };
}

/** The user's three-object physics study, wired to the reusable rigid-body simulation. */
export function ricochetProject() {
  const project = JSON.parse(physicsSource) as { svertik: 'project'; version: 1; name: string; canvas: string; scene: SceneV1 };
  project.scene.notes = 'A hollow, immovable Wall contains two moving rigid bodies. Body 1 is a rounded hexagon with an initial velocity and spin; Body 2 is a smaller circle. They collide with the Wall and each other in a shared Physics group with zero acceleration and friction and full restitution. Select either Rigid body to adjust its velocity vector on the canvas, change Spin, or make it Immovable.';
  return project;
}

export function crossFillProject() {
  return {
    svertik: 'project', version: 1, name: 'Cross Fill', canvas: '#F2E8DA',
    scene: {
      version: 1, document: { width: 800, height: 650 },
      notes: 'A triangle filled with a regular grid of small crosses. Edit Size and Width on Cross, grid dimensions/spacing in Clone, and the hidden Triangle for the boundary. The triangle is only the mask and is not drawn. Mask with Whole elements discards crosses crossing the edge, keeping every cross complete.',
      objects: [
        { kind: 'shape', id: 'cross-pattern', name: 'Cross', shape: 'cross', params: { size: 18, width: 4, fill: true, fillColor: '#D2502F', stroke: false }, stack: [
          { id: 'cross-grid', type: 'clone', params: { mode: 'grid', columns: 18, rows: 16, spacing: [1.55, 1.55] } },
          { id: 'cross-mask', type: 'mask', params: { source: 'triangle-mask', mode: 'shape', whole: true } },
        ] },
        { kind: 'shape', id: 'triangle-mask', name: 'Triangle', shape: 'polygon', params: { radius: 270, sides: 3, fill: true, fillColor: '#ffffff', stroke: false }, stack: [], visible: false },
      ],
    },
  };
}

/** Two procedural signals, without timeline keys, on the same grid of crosses. */
export function motionProject() {
  return {
    svertik: 'project' as const, version: 1 as const, name: 'Motion', canvas: '#F2E8DA',
    scene: {
      version: 1 as const, document: { width: 1000, height: 700 },
      notes: 'A grid of crosses animated without keyframes. Wiggle adds independent smooth rotation and horizontal drift; Oscillate sends a sine wave through vertical position, scale and hue. Open the children of each modulator to set the motion amplitudes. Time uses scene.time; change it to remap the local clock.',
      animation: { duration: 12, loop: true, autoplay: true, fps: 30, tracks: [] },
      objects: [{ kind: 'shape' as const, id: 'motion-cross', name: 'Cross', shape: 'cross', params: { size: 20, width: 5, fill: true, fillColor: '#D2502F', stroke: false }, stack: [
        { id: 'motion-grid', type: 'clone', params: { mode: 'grid', columns: 15, rows: 9, spacing: [2.7, 2.7] } },
        { id: 'motion-wiggle', type: 'wiggle', params: { time: { $expr: 'scene.time', fallback: 0 }, frequency: 1.3, seed: 7 }, children: [
          { id: 'motion-drift', type: 'transform', params: { x: 6, rotation: 25 } },
        ] },
        { id: 'motion-oscillate', type: 'oscillate', params: { time: { $expr: 'scene.time', fallback: 0 }, frequency: 0.5, elementPhase: 16 }, children: [
          { id: 'motion-wave', type: 'transform', params: { y: 18, scale: 1.18 } },
          { id: 'motion-color', type: 'color', params: { mode: 'shift', hue: 22 } },
        ] },
      ] }],
    },
  };
}

/** Repeated pulses followed by a staggered one-shot impact. */
export function rhythmProject() {
  return {
    svertik: 'project' as const, version: 1 as const, name: 'Rhythm', canvas: '#F2E8DA',
    scene: {
      version: 1 as const, document: { width: 1000, height: 500 },
      notes: 'Five crosses breathe in rhythm with Pulse (scale and hue). At 2 seconds, Shake sends an impact through them with 0.15 seconds between elements. Pulse uses cycle fractions for attack and decay; Shake uses seconds for start, duration and delay. Both follow scene.time and need no keyframes.',
      animation: { duration: 6, loop: true, autoplay: true, fps: 30, tracks: [] },
      objects: [{ kind: 'shape' as const, id: 'rhythm-cross', name: 'Cross', shape: 'cross', params: { size: 70, width: 16, fill: true, fillColor: '#D2502F', stroke: false }, stack: [
        { id: 'rhythm-grid', type: 'clone', params: { mode: 'grid', columns: 5, rows: 1, spacing: [2.3, 1] } },
        { id: 'rhythm-pulse', type: 'pulse', params: { time: { $expr: 'scene.time', fallback: 0 }, frequency: 1, attack: 0.08, decay: 0.55, elementPhase: 36 }, children: [
          { id: 'rhythm-scale', type: 'transform', params: { scale: 1.35 } },
          { id: 'rhythm-color', type: 'color', params: { mode: 'shift', hue: 20 } },
        ] },
        { id: 'rhythm-shake', type: 'shake', params: { time: { $expr: 'scene.time', fallback: 0 }, start: 2, duration: 1.2, frequency: 10, perElement: true, elementDelay: 0.15, seed: 3 }, children: [
          { id: 'rhythm-impact', type: 'transform', params: { x: 18, y: 10, rotation: 25 } },
        ] },
      ] }],
    },
  };
}

/** A lighter BOOM copy keeps several compositions responsive while preserving the standalone demo. */
function compositionBoomScene() {
  const project = gravityProject() as { scene: SceneV1; canvas: string };
  const scene: SceneV1 = structuredClone(project.scene);
  const visit = (nodes: SceneNode[]) => {
    for (const node of nodes) {
      if (node.id === 'gravity-confetti') {
        const particles = node.stack.find((modifier) => modifier.type === 'particles');
        if (particles) particles.params = { ...particles.params, count: 60 };
      }
      if (node.kind === 'group') visit(node.children);
    }
  };
  visit(scene.objects);
  return { scene, canvas: project.canvas };
}

/** The same BOOM scene twice, each with its own local clock and ID scope. */
export function compositionsProject() {
  const source = compositionBoomScene();
  return {
    svertik: 'project' as const, version: 1 as const, name: 'Compositions', canvas: source.canvas,
    scene: {
      version: 1 as const, document: { width: 1400, height: 900 },
      notes: 'Two independent copies of the BOOM scene. Boom runs at normal speed; Boom slow at 60%. Open either composition to edit its own Circle, Boom and confetti. Return with the breadcrumb above. Both scenes have identical local IDs safely isolated from one another. Their effects, physics, expressions and keyframes follow their local clocks.',
      animation: { duration: 5, loop: true, autoplay: true, fps: 30, tracks: [] },
      objects: [
        { kind: 'group' as const, id: 'boom-normal', name: 'Boom', children: [], stack: [], transform: { x: -350, scale: 0.45 }, composition: { scene: source.scene, params: { time: { $expr: 'scene.time', fallback: 0 }, speed: 1, loop: 'hold' } } },
        { kind: 'group' as const, id: 'boom-slow', name: 'Boom slow', children: [], stack: [], transform: { x: 350, scale: 0.45 }, composition: { scene: structuredClone(source.scene), params: { time: { $expr: 'scene.time', fallback: 0 }, speed: 0.6, loop: 'hold' } } },
      ],
    },
  };
}

/** Keyframed local clocks: advance, freeze, rewind, plus clock modulation and stop motion. */
export function timeRemapProject() {
  const source = compositionBoomScene();
  const duration = 5.5;
  const objects = [0, 1, 2].map(i => {
    const scene = structuredClone(source.scene);
    (scene.animation as import('@svertik/engine').Animation).markers = [{ id: 'local-impact', name: 'Explosion', t: 1.24 }];
    return {
      kind: 'group' as const, id: `remap-${i}`, name: ['Freeze & rewind', 'Clock signal', 'Stop motion'][i]!, children: [], stack: [],
      transform: { x: (i - 1) * 450, scale: 0.3 },
      composition: { scene, params: { time: 0, frameRate: i === 2 ? 8 : 0, loop: 'hold' },
        ...(i === 1 ? { modulation: { type: 'oscillate' as const, params: { time: { $expr: 'scene.time', fallback: 0 }, amplitude: 0.08, frequency: 1.5, perElement: false } } } : {}) },
    };
  });
  const tracks: Track[] = objects.map((node, i) => {
    const delay = i * 0.25;
    return { id: `remap-track-${i}`, node: node.id, on: 'composition', param: 'time', keys: [
      { t: 0, value: 0, ease: delay ? 'hold' : 'linear' },
      ...(delay ? [{ t: delay, value: 0, ease: 'linear' as const }] : []),
      { t: 1.5 + delay, value: 1.65, ease: 'hold' },
      { t: 2.3 + delay, value: 1.65, ease: 'ease-in-out' },
      { t: 4.3 + delay, value: 0, ease: 'hold' },
      { t: duration, value: 0 },
    ] };
  });
  return {
    svertik: 'project' as const, version: 1 as const, name: 'Time Remap', canvas: source.canvas,
    scene: { version: 1 as const, document: { width: 1500, height: 750 }, objects,
      notes: 'Three BOOM compositions with keyframed Time: advance to the explosion, hold, then rewind to restore the circle. The middle copy adds a small Oscillate signal to its clock; the right copy updates at 8 FPS. Their starts are staggered. Timeline markers name the main beats; the child Explosion marker can be used as an offset in the Composition inspector.',
      animation: { duration, fps: 30, loop: true, autoplay: true, tracks, markers: [
        { id: 'beat-impact', name: 'Impact', t: 1.2 }, { id: 'beat-freeze', name: 'Freeze', t: 1.5 },
        { id: 'beat-rewind', name: 'Rewind', t: 2.3 }, { id: 'beat-rest', name: 'Rest', t: 4.3 },
      ] },
    },
  };
}
