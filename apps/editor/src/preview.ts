// The preview card of a shared link: what chat apps and social sites show (Open Graph image, 1200 × 630).

export const CARD = { width: 1200, height: 630 } as const;

/** Where an image of `width` × `height` goes in the card: whole, centred, as large as it fits. */
export function fitCard(width: number, height: number, pad = 0): { x: number; y: number; width: number; height: number } {
  const room = { width: CARD.width - 2 * pad, height: CARD.height - 2 * pad };
  const scale = Math.min(room.width / Math.max(1, width), room.height / Math.max(1, height));
  const w = width * scale, h = height * scale;
  return { x: (CARD.width - w) / 2, y: (CARD.height - h) / 2, width: w, height: h };
}

/** An image (PNG, or SVG with its size set) fitted into the card on the scene's background, as a JPEG. */
export async function previewCard(image: Blob, background: string): Promise<Blob> {
  const url = URL.createObjectURL(image);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = Object.assign(document.createElement('canvas'), CARD);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, CARD.width, CARD.height);
    const box = fitCard(img.naturalWidth || img.width, img.naturalHeight || img.height);
    ctx.drawImage(img, box.x, box.y, box.width, box.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Could not make the preview')), 'image/jpeg', 0.86,
    ));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A scene's SVG (from the engine) at the size that fills the card, ready for previewCard. */
export function svgForCard(svg: string): Blob {
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(/[\s,]+/).map(Number) ?? [0, 0, CARD.width, CARD.height];
  const box = fitCard(vb[2] || CARD.width, vb[3] || CARD.height);
  // As the PNG export: the engine's <svg> carries a viewBox and no size.
  const sized = svg.replace('<svg ', `<svg width="${Math.round(box.width)}" height="${Math.round(box.height)}" `);
  return new Blob([sized], { type: 'image/svg+xml' });
}
