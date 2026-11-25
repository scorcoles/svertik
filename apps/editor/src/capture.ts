/** Download the rendered frame, without advancing or re-evaluating the player. */
export async function downloadFrame(svg: SVGSVGElement, background: string, name = 'svertik'): Promise<void> {
  const png = await captureFrame(svg, background);
  const url = URL.createObjectURL(png);
  const link = Object.assign(document.createElement('a'), {
    href: url, download: `${name.replace(/[\\/:*?"<>|]/g, '_') || 'svertik'}-capture.png`,
  });
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Allow the browser to start downloading before releasing the blob.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** The rendered frame as a PNG, at its on-screen size, without advancing or re-evaluating the player. */
export async function captureFrame(svg: SVGSVGElement, background: string): Promise<Blob> {
  // Freeze the DOM before any asynchronous work; playback can continue normally.
  const snapshot = svg.cloneNode(true) as SVGSVGElement;
  const rect = svg.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * scale));
  const height = Math.max(1, Math.round(rect.height * scale));
  snapshot.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  snapshot.setAttribute('width', String(width));
  snapshot.setAttribute('height', String(height));
  snapshot.removeAttribute('class');
  snapshot.style.width = `${width}px`;
  snapshot.style.height = `${height}px`;
  // mountCanvas keeps a hidden <foreignObject> in the SVG even on SVG-rendered frames.
  // SVGImageElement.decode() rejects some browser-serialized HTML canvas descendants.
  snapshot.querySelectorAll('foreignObject[data-svertik-canvas]').forEach((node) => node.remove());
  const source = new XMLSerializer().serializeToString(snapshot);
  const surface = svg.querySelector<HTMLCanvasElement>('foreignObject[data-svertik-canvas] canvas');
  const holder = surface?.closest<SVGForeignObjectElement>('foreignObject');
  let png: Blob;
  if (surface && holder && getComputedStyle(holder).display !== 'none' && surface.width && surface.height) {
    try {
      png = await rasterizeSurface(svg, surface, width, height, background);
    } catch {
      // Keep an SVG-based fallback only when the frame still has vector geometry to capture.
      if (!snapshot.querySelector('[data-svertik-shape]')) throw new Error('Could not capture the canvas frame');
      png = await rasterize(source, width, height, background);
    }
  } else png = await rasterize(source, width, height, background);
  return png;
}

/** Capture the currently visible canvas renderer at the same viewport size as an SVG capture. */
async function rasterizeSurface(svg: SVGSVGElement, surface: HTMLCanvasElement, width: number, height: number, background: string): Promise<Blob> {
  const frame = Object.assign(document.createElement('canvas'), { width, height });
  const ctx = frame.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  const frameRect = svg.getBoundingClientRect();
  const surfaceRect = surface.getBoundingClientRect();
  const scaleX = width / Math.max(1, frameRect.width), scaleY = height / Math.max(1, frameRect.height);
  ctx.drawImage(surface,
    (surfaceRect.left - frameRect.left) * scaleX,
    (surfaceRect.top - frameRect.top) * scaleY,
    surfaceRect.width * scaleX,
    surfaceRect.height * scaleY,
  );
  return canvasBlob(frame);
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Could not capture the frame')), 'image/png',
  ));
}

async function rasterize(source: string, width: number, height: number, background: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width, height });
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    return await canvasBlob(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}
