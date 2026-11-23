// Canvas zoom and pan, without the DOM.
// `zoom` multiplies the fit (1 = the drawing fitted); `pan` is the offset in screen pixels.

export interface View {
  zoom: number;
  pan: { x: number; y: number };
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 64;

/** Scale at which the viewBox fits the stage (what the browser does with preserveAspectRatio). */
export const fitScale = (stageW: number, stageH: number, vbW: number, vbH: number) =>
  vbW > 0 && vbH > 0 ? Math.min(stageW / vbW, stageH / vbH) : 1;

/** Zoom multiplied by `factor`, keeping the stage point (px, py) still. */
export function zoomAt(v: View, factor: number, px: number, py: number): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
  const k = zoom / v.zoom;
  return { zoom, pan: { x: px - (px - v.pan.x) * k, y: py - (py - v.pan.y) * k } };
}

/** At 100 % (1 SVG unit = 1 pixel), centred on the stage. */
export function actualSize(v: View, fit: number, stageW: number, stageH: number): View {
  return zoomAt(v, 1 / (fit * v.zoom), stageW / 2, stageH / 2);
}

export const FIT: View = { zoom: 1, pan: { x: 0, y: 0 } };

/**
 * Mouse wheel or trackpad? A mouse gives big whole vertical jumps;
 * a trackpad, small deltas or a horizontal component. A pinch arrives with ctrlKey.
 */
export function wheelIntent(e: { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; metaKey: boolean }): 'zoom' | 'pan' {
  if (e.ctrlKey || e.metaKey) return 'zoom';
  if (e.deltaMode !== 0) return 'zoom'; // lines or pages: a mouse
  if (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50) return 'zoom';
  return 'pan';
}

/** Zoom factor for a wheel event (pinch finer than the wheel). */
export const wheelFactor = (deltaY: number, pinch: boolean) => Math.exp(-deltaY * (pinch ? 0.01 : 0.0015));
