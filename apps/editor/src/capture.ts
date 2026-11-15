/** Download the rendered frame, without advancing or re-evaluating the player. */
export async function downloadFrame(svg: SVGSVGElement, background: string, name = 'svertik'): Promise<void> {
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
  const source = new XMLSerializer().serializeToString(snapshot);
  const png = await rasterize(source, width, height, background);
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
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Could not capture the frame')), 'image/png',
    ));
  } finally {
    URL.revokeObjectURL(url);
  }
}
