import { defineModifier } from '../modifier';
import { IDENTITY, multiply } from '../matrix';

/** Paints each filled path from another node's raster image in a shared, movable material frame. */
export const imagefill = defineModifier({
  type: 'imagefill',
  label: 'Image Fill',
  kind: 'style',
  params: {
    source: { type: 'node', default: '', label: 'Source', animatable: false },
    hideSource: { type: 'boolean', default: true, label: 'Hide source', group: 'Source', animatable: false },
    fit: { type: 'enum', default: 'cover', options: ['cover', 'contain', 'stretch'] as const, label: 'Fit', animatable: false },
    scale: { type: 'number', default: 1, min: 0.1, max: 5, step: 0.01, group: 'Adjust', label: 'Scale' },
    position: { type: 'point', default: [0.5, 0.5], unit: 'fraction', group: 'Adjust', label: 'Position', min: 0 },
  },
  apply(geo, p, ctx) {
    if (!p.source) return geo;
    const source = ctx.target?.(p.source)?.shapes.find((shape) => shape.image)?.image;
    if (!source) return geo;
    // The stack keeps its original source bounds even after Crack has emitted many pieces.
    // Anchor one image frame to that box so every shard samples the same region.
    const box = ctx.bounds;
    const shapes = geo.shapes.map((shape) => {
      if ((shape.style.fill ?? 'black') === 'none') return shape;
      if (box.width <= 0 || box.height <= 0) return shape;
      const { materialTransform, ...painted } = shape;
      return {
        ...painted,
        ...(materialTransform ? { patternTransform: multiply(materialTransform, shape.patternTransform ?? IDENTITY) } : {}),
        imageFill: {
          href: source.href,
          x: box.x, y: box.y, width: box.width, height: box.height,
          sourceWidth: source.width, sourceHeight: source.height,
          fit: p.fit as 'cover' | 'contain' | 'stretch',
          scale: p.scale,
          position: [Math.max(0, Math.min(1, p.position[0])), Math.max(0, Math.min(1, p.position[1]))] as [number, number],
          background: shape.style.fill ?? '#000000',
        },
      };
    });
    return { viewBox: geo.viewBox, shapes };
  },
});
