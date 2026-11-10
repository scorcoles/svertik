// Iconos de 16 px: geométricos, trazo de 1 px, sin relleno, color = currentColor.
// Las coordenadas van en medios píxeles para que el trazo caiga nítido.
// Fuente de verdad: este archivo. Se suben a Penpot (página Icons) como componentes.

export const icons = {
  // Objetos
  select: 'M3.5 1.5v11l3-2.75 2 4.25 1.75-.75-2-4.25h4.25z',
  group: 'M1.5 3.5h5l1.5 2h6.5v8h-13z',
  ungroup: 'M1.5 3.5h5l1.5 2h6.5v8h-13z M5 9.5h5.5 M8.5 7.5l2 2-2 2',
  rectangle: 'M2.5 3.5h11v9h-11z',
  ellipse: 'M8 3.5a6 4.5 0 1 0 0 9a6 4.5 0 1 0 0-9',
  polygon: 'M8 1.5l5.6 3.25v6.5L8 14.5l-5.6-3.25v-6.5z',
  star: 'M8 1.5l1.9 4.1 4.6.5-3.4 3.1.9 4.5L8 11.4l-4 2.3.9-4.5-3.4-3.1 4.6-.5z',
  line: 'M2.5 13.5l11-11',
  spiral: 'M8 8a1 1 0 0 1 1 1 2 2 0 0 1-2 2 3 3 0 0 1-3-3 4 4 0 0 1 4-4 5 5 0 0 1 5 5 6 6 0 0 1-6 6',
  text: 'M3.5 3.5h9 M8 3.5v9.5 M6 13h4',
  pawn: 'M8 1.5a2.25 2.25 0 1 0 0 4.5a2.25 2.25 0 1 0 0-4.5 M5.5 7h5 M6.5 7l-1.5 5.5 M9.5 7l1.5 5.5 M3.5 12.5h9v2h-9z',
  pencil: 'M10.5 2.5l3 3-8 8h-3v-3z M9 4l3 3',
  object: 'M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3',
  // Efectos
  transform: 'M8 1.5v13 M1.5 8h13 M6 3.5l2-2 2 2 M6 12.5l2 2 2-2 M3.5 6l-2 2 2 2 M12.5 6l2 2-2 2',
  rotate3d: 'M1.5 8a6.5 2.5 0 1 0 13 0a6.5 2.5 0 1 0-13 0 M8 1.5a2.5 6.5 0 1 0 0 13a2.5 6.5 0 1 0 0-13',
  spherize: 'M8 1.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13 M1.5 8c2 2.5 11 2.5 13 0 M8 1.5c-2.5 2-2.5 11 0 13',
  twist: 'M8 8m-1 0a1 1 0 1 1 2 0a2.5 2.5 0 0 1-5 0a4 4 0 0 1 8 0a5.5 5.5 0 0 1-11 0',
  bend: 'M1.5 12.5c3-7 10-7 13 0 M1.5 15c3-7 10-7 13 0',
  taper: 'M2.5 1.5h11l-3 13h-5z',
  shear: 'M5.5 2.5h9l-4 11h-9z',
  ripple: 'M8 8m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0 M8 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M8 8m-6.5 0a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0',
  cylinder: 'M3.5 3.5a4.5 1.5 0 1 0 9 0a4.5 1.5 0 1 0-9 0 M3.5 3.5v9a4.5 1.5 0 0 0 9 0v-9',
  perspective: 'M4.5 2.5h7l3 11h-13z M8 2.5v11 M2.9 8h10.2',
  envelope: 'M2.5 2.5c3 2 8 2 11 0v11c-3-2-8-2-11 0z M2.5 8c3 1 8 1 11 0 M8 3.8v8.4',
  melt: 'M2.5 2.5h11v5c0 2-1 3-1.5 3s-.5-2-1.5-2-1 5-2 5-1-4-2-4-1 2-2 2-2-1-2-3z',
  wave: 'M0.5 8c1.75-4 3.25-4 5 0s3.25 4 5 0 3.25-4 5 0',
  noise: 'M0.5 9.5l2-3 2 4 2-6 2 5 2-3 2 4 2-3',
  pathwrap: 'M1.5 12.5c2-8 5-8 6.5-4s4.5 4 6.5-4 M3 14.5l1-2 M6 11.5l1.5-1 M10 10.5l1.5 1',
  damage: 'M1.5 2.5h13l-6.5 11.5z M6 2.5l1.5 2.5-1 1.5 1.5 2 M11.5 5.5l-1.5 1 M3.5 4.5h1 M9 9.5h1',
  roughen: 'M1.5 12.5l1.5-2 1 1.5 1.5-3 1 1 1.5-3.5 1 2 1.5-2.5 1 1.5 1.5-2.5 1 1 M1.5 14.5h13',
  fractal: 'M8 1.5l6.5 12h-13z M4.75 7.75h6.5 M8 13.5l-3.25-5.75 M8 13.5l3.25-5.75',
  glitch: 'M2.5 2.5h9v3h-9z M4.5 6.5h9v3h-9z M1.5 10.5h9v3h-9z M12.5 12h2',
  morph: 'M2.5 3.5h5v5h-5z M10.5 10.5m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M7.5 6l2 2 M9.5 6v2h-2',
  explosion: 'M8 8m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0 M8 1.5v3 M8 11.5v3 M1.5 8h3 M11.5 8h3 M3.5 3.5l2 2 M10.5 10.5l2 2 M12.5 3.5l-2 2 M5.5 10.5l-2 2',
  mosaic: 'M1.5 1.5h3.5v3.5h-3.5z M6.25 1.5h3.5v3.5h-3.5z M11 1.5h3.5v3.5h-3.5z M1.5 6.25h3.5v3.5h-3.5z M6.25 6.25h3.5v3.5h-3.5z M11 6.25h3.5v3.5h-3.5z M1.5 11h3.5v3.5h-3.5z M6.25 11h3.5v3.5h-3.5z M11 11h3.5v3.5h-3.5z',
  boolean: 'M1.5 1.5h8v8h-8z M6.5 6.5h8v8h-8z M6.5 6.5h3v3h-3z',
  mirror: 'M8 1.5v13 M6 3.5l-4.5 4.5 4.5 4.5z M10 3.5l4.5 4.5-4.5 4.5z',
  'flip-h': 'M8 1.5v2 M8 6v4 M8 12.5v2 M6 3.5l-4.5 9h4.5z M10 3.5l4.5 9h-4.5z',
  'flip-v': 'M1.5 8h2 M6 8h4 M12.5 8h2 M3.5 6l9-4.5v4.5z M3.5 10l9 4.5v-4.5z',
  clone: 'M1.5 1.5h5v5h-5z M9.5 1.5h5v5h-5z M1.5 9.5h5v5h-5z M9.5 9.5h5v5h-5z',
  step: 'M1.5 14.5h4v-4h4v-4h4v-4h1',
  range: 'M1.5 11.5h2v-3h2v-4h2v-2h2v2h2v4h2v3h1 M1.5 13.5h13',
  field: 'M8 8m-6.5 0a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0 M8 8m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M8 8m-.5 0a.5 .5 0 1 0 1 0a.5 .5 0 1 0-1 0',
  opacity: 'M2.5 2.5h11v11h-11z M2.5 13.5l11-11 M6 13.5l7.5-7.5 M2.5 10l7.5-7.5',
  color: 'M8 1.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13 M8 1.5v13 M8 4.5h4.5 M8 8h6.5 M8 11.5h4.5',
  tint: 'M8 1.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13 M5 11l6-6 M3.5 8.5l5-5 M7.5 12.5l5-5',
  gradient: 'M2.5 2.5h11v11h-11z M5.5 2.5v11 M8.5 2.5v11 M11 2.5v11',
  paint: 'M2.5 2.5h8v8h-8z M5.5 5.5h8v8h-8z',
  crack: 'M8 1.5l-1 4 2 2-2.5 3 1 4 M7 5.5l-4-1 M9 7.5l4 1.5 M6.5 10.5l-3 2',
  // Organizar
  'align-left': 'M1.5 1.5v13 M3.5 3.5h9v3h-9z M3.5 9.5h5v3h-5z',
  'align-hcenter': 'M8 1.5v13 M3.5 3.5h9v3h-9z M5.5 9.5h5v3h-5z',
  'align-right': 'M14.5 1.5v13 M3.5 3.5h9v3h-9z M7.5 9.5h5v3h-5z',
  'align-top': 'M1.5 1.5h13 M3.5 3.5h3v9h-3z M9.5 3.5h3v5h-3z',
  'align-vcenter': 'M1.5 8h13 M3.5 3.5h3v9h-3z M9.5 5.5h3v5h-3z',
  'align-bottom': 'M1.5 14.5h13 M3.5 3.5h3v9h-3z M9.5 7.5h3v5h-3z',
  'distribute-h': 'M1.5 1.5v13 M14.5 1.5v13 M6.5 4.5h3v7h-3z',
  'distribute-v': 'M1.5 1.5h13 M1.5 14.5h13 M4.5 6.5h7v3h-7z',
  // Booleanos: los dos cuadrados (atrás y delante); lo que queda, relleno (ver iconFills).
  'bool-union': 'M1.5 1.5h9v9h-9z M5.5 5.5h9v9h-9z',
  'bool-subtract': 'M1.5 1.5h9v9h-9z M5.5 5.5h9v9h-9z',
  'bool-intersect': 'M1.5 1.5h9v9h-9z M5.5 5.5h9v9h-9z',
  'bool-exclude': 'M1.5 1.5h9v9h-9z M5.5 5.5h9v9h-9z',
  // Orden: al frente, subir, bajar, al fondo
  'order-front': 'M3.5 2.5h9 M8 14.5v-9 M5 8.5l3-3 3 3',
  'order-forward': 'M8 13.5v-9 M5 7.5l3-3 3 3',
  'order-backward': 'M8 2.5v9 M5 8.5l3 3 3-3',
  'order-back': 'M3.5 13.5h9 M8 1.5v9 M5 7.5l3 3 3-3',
  // Reproducción
  play: 'M4.5 2.5v11l9-5.5z',
  pause: 'M4.5 2.5v11 M11.5 2.5v11',
  'to-start': 'M3.5 2.5v11 M13.5 2.5v11l-8-5.5z',
  timeline: 'M1.5 4.5h13 M1.5 8h13 M1.5 11.5h13 M5.5 2.5v11 M10 6.5l1.5 1.5-1.5 1.5-1.5-1.5z',
  // Interfaz
  center: 'M8 1.5v4 M8 10.5v4 M1.5 8h4 M10.5 8h4 M7 7h2v2h-2z',
  link: 'M6.5 9.5l3-3 M7.5 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1 M8.5 11.5l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1',
  unlink: 'M7.5 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1 M8.5 11.5l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1 M2.5 2.5l2 2 M13.5 13.5l-2-2',
  zero: 'M8 2.5c2.25 0 3.5 2.25 3.5 5.5s-1.25 5.5-3.5 5.5-3.5-2.25-3.5-5.5 1.25-5.5 3.5-5.5z M5.5 11.5l5-7',
  dice: 'M2.5 2.5h11v11h-11z M5 5h1v1h-1z M10 10h1v1h-1z M7.5 7.5h1v1h-1z M10 5h1v1h-1z M5 10h1v1h-1z',
  eye: 'M1.5 8c2-3.5 4-5 6.5-5s4.5 1.5 6.5 5c-2 3.5-4 5-6.5 5s-4.5-1.5-6.5-5z M8 8m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  'eye-off': 'M1.5 8c2-3.5 4-5 6.5-5s4.5 1.5 6.5 5c-2 3.5-4 5-6.5 5s-4.5-1.5-6.5-5z M8 8m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M2.5 13.5l11-11',
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

/**
 * Relleno tenue (40 % del color) para los pocos iconos que lo necesitan para entenderse:
 * los booleanos, cuyo significado es la zona que queda. El resto, solo trazo.
 */
export const iconFills: Partial<Record<IconName, string>> = {
  'bool-union': 'M1.5 1.5h9v4h4v9h-9v-4h-4z',
  'bool-subtract': 'M1.5 1.5h9v4h-5v5h-4z',
  'bool-intersect': 'M5.5 5.5h5v5h-5z',
  'bool-exclude': 'M1.5 1.5h9v4h-5v5h-4z M10.5 5.5h4v9h-9v-4h5z',
};

/** El icono como SVG completo (para exportar o subir a Penpot). */
export const iconSVG = (name: IconName, color = 'currentColor') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="${color}" stroke-width="1" stroke-linecap="square" stroke-linejoin="miter">${iconFills[name] ? `<path d="${iconFills[name]}" fill="${color}" fill-opacity="0.4" stroke="none"/>` : ''}<path d="${icons[name]}"/></svg>`;
