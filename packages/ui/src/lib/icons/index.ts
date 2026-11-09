// Iconos de 16 px: geométricos, trazo de 1 px, sin relleno, color = currentColor.
// Las coordenadas van en medios píxeles para que el trazo caiga nítido.
// Fuente de verdad: este archivo. Se suben a Penpot (página Icons) como componentes.

export const icons = {
  // Objetos
  object: 'M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3',
  // Efectos
  transform: 'M8 1.5v13 M1.5 8h13 M6 3.5l2-2 2 2 M6 12.5l2 2 2-2 M3.5 6l-2 2 2 2 M12.5 6l2 2-2 2',
  rotate3d: 'M1.5 8a6.5 2.5 0 1 0 13 0a6.5 2.5 0 1 0-13 0 M8 1.5a2.5 6.5 0 1 0 0 13a2.5 6.5 0 1 0 0-13',
  spherize: 'M8 1.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13 M1.5 8c2 2.5 11 2.5 13 0 M8 1.5c-2.5 2-2.5 11 0 13',
  twist: 'M8 8m-1 0a1 1 0 1 1 2 0a2.5 2.5 0 0 1-5 0a4 4 0 0 1 8 0a5.5 5.5 0 0 1-11 0',
  bend: 'M1.5 12.5c3-7 10-7 13 0 M1.5 15c3-7 10-7 13 0',
  wave: 'M0.5 8c1.75-4 3.25-4 5 0s3.25 4 5 0 3.25-4 5 0',
  noise: 'M0.5 9.5l2-3 2 4 2-6 2 5 2-3 2 4 2-3',
  clone: 'M1.5 1.5h5v5h-5z M9.5 1.5h5v5h-5z M1.5 9.5h5v5h-5z M9.5 9.5h5v5h-5z',
  crack: 'M8 1.5l-1 4 2 2-2.5 3 1 4 M7 5.5l-4-1 M9 7.5l4 1.5 M6.5 10.5l-3 2',
  // Interfaz
  plus: 'M8 2.5v11 M2.5 8h11',
  'axis-h': 'M1.5 8h13 M4 5.5l-2.5 2.5 2.5 2.5 M12 5.5l2.5 2.5-2.5 2.5',
  'axis-v': 'M8 1.5v13 M5.5 4l2.5-2.5 2.5 2.5 M5.5 12l2.5 2.5 2.5-2.5',
  up: 'M4 10l4-4 4 4',
  down: 'M4 6l4 4 4-4',
  trash: 'M2.5 4.5h11 M6.5 4.5v-2h3v2 M4 4.5l.5 9h7l.5-9',
  undo: 'M5.5 3.5l-3 3 3 3 M2.5 6.5h7a3.5 3.5 0 0 1 0 7h-3',
  redo: 'M10.5 3.5l3 3-3 3 M13.5 6.5h-7a3.5 3.5 0 0 0 0 7h3',
  import: 'M8 1.5v9 M5 7.5l3 3 3-3 M2.5 11.5v3h11v-3',
  export: 'M8 10.5v-9 M5 4.5l3-3 3 3 M2.5 11.5v3h11v-3',
} as const;

export type IconName = keyof typeof icons;

/** El icono como SVG completo (para exportar o subir a Penpot). */
export const iconSVG = (name: IconName, color = 'currentColor') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="${color}" stroke-width="1" stroke-linecap="square" stroke-linejoin="miter"><path d="${icons[name]}"/></svg>`;
