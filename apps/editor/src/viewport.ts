// Zoom y desplazamiento del lienzo, sin DOM.
// `zoom` multiplica el encaje (1 = el dibujo encajado); `pan` es el desplazamiento en píxeles de pantalla.

export interface View {
  zoom: number;
  pan: { x: number; y: number };
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 64;

/** Escala a la que el viewBox cabe en el escenario (lo que hace el navegador con preserveAspectRatio). */
export const fitScale = (stageW: number, stageH: number, vbW: number, vbH: number) =>
  vbW > 0 && vbH > 0 ? Math.min(stageW / vbW, stageH / vbH) : 1;

/** Zoom multiplicado por `factor` manteniendo quieto el punto (px, py) del escenario. */
export function zoomAt(v: View, factor: number, px: number, py: number): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
  const k = zoom / v.zoom;
  return { zoom, pan: { x: px - (px - v.pan.x) * k, y: py - (py - v.pan.y) * k } };
}

/** Al 100 % (1 unidad del SVG = 1 píxel), centrado en el escenario. */
export function actualSize(v: View, fit: number, stageW: number, stageH: number): View {
  return zoomAt(v, 1 / (fit * v.zoom), stageW / 2, stageH / 2);
}

export const FIT: View = { zoom: 1, pan: { x: 0, y: 0 } };

/**
 * ¿Rueda de ratón o trackpad? El ratón da saltos grandes y enteros en vertical;
 * el trackpad, deltas pequeños o con componente horizontal. El pellizco llega con ctrlKey.
 */
export function wheelIntent(e: { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; metaKey: boolean }): 'zoom' | 'pan' {
  if (e.ctrlKey || e.metaKey) return 'zoom';
  if (e.deltaMode !== 0) return 'zoom'; // líneas o páginas: ratón
  if (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50) return 'zoom';
  return 'pan';
}

/** Factor de zoom para un evento de rueda (pellizco más fino que la rueda). */
export const wheelFactor = (deltaY: number, pinch: boolean) => Math.exp(-deltaY * (pinch ? 0.01 : 0.0015));
