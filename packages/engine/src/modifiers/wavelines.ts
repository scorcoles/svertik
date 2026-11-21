import { line, type Geometry, type Shape, type Style, type SubPath, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';
import { colorSampler, darkness, prepare, type Layer } from './halftone';

const MAX_SAMPLES = 120_000;

/** Horizontal tonal scanlines whose displacement and weight follow the sampled image. */
export const wavelines = defineModifier({
  type: 'wavelines', label: 'Wave Lines', kind: 'generator',
  params: {
    spacing: { type: 'number', default: 12, min: 2, max: 120, step: 0.5, unit: 'px', label: 'Line spacing', random: [8, 24] },
    resolution: { type: 'number', default: 6, min: 1, max: 40, step: 0.5, unit: 'px', label: 'Sample spacing', random: [4, 12] },
    amplitude: { type: 'number', default: 22, min: 0, max: 160, step: 1, unit: 'px', label: 'Wave amount', random: [8, 48] },
    wavelength: { type: 'number', default: 180, min: 12, max: 1200, step: 1, unit: 'px', label: 'Wavelength', random: [80, 320] },
    width: { type: 'number', default: 1.4, min: 0.1, max: 12, step: 0.1, unit: 'px', label: 'Line width', random: [0.8, 2.4] },
    weight: { type: 'number', default: 0.8, min: 0, max: 1, step: 0.01, label: 'Tone weight', random: [0.4, 1] },
    gamma: { type: 'number', default: 1, min: 0.1, max: 4, step: 0.05, label: 'Gamma', random: [0.7, 1.6] },
    invert: { type: 'boolean', default: false, label: 'Invert' },
    time: { type: 'number', default: 0, min: 0, max: 3600, step: 0.01, unit: 's', label: 'Time' },
    speed: { type: 'number', default: 0.35, min: -4, max: 4, step: 0.01, unit: 'Hz', label: 'Speed', random: [-0.8, 0.8] },
  },
  apply(geo, p, ctx): Geometry {
    if (!geo.shapes.length || !(p.spacing > 0) || !(p.resolution > 0) || !(p.wavelength > 0)) return { viewBox: geo.viewBox, shapes: [] };
    const layers = geo.shapes.map((shape) => prepare(shape)).filter((layer): layer is Layer => !!layer);
    if (!layers.length) return { viewBox: geo.viewBox, shapes: [] };
    const sample = colorSampler(layers, true);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const layer of layers) {
      x0 = Math.min(x0, layer.box[0]); y0 = Math.min(y0, layer.box[1]);
      x1 = Math.max(x1, layer.box[2]); y1 = Math.max(y1, layer.box[3]);
    }
    const width = Math.max(x1 - x0, 1), height = Math.max(y1 - y0, 1);
    let spacing = Math.max(2, p.spacing), resolution = Math.max(1, p.resolution);
    const estimate = () => Math.ceil(height / spacing) * Math.ceil(width / resolution);
    if (estimate() > MAX_SAMPLES) {
      const factor = Math.sqrt(estimate() / MAX_SAMPLES);
      spacing *= factor; resolution *= factor;
    }

    const rows = Math.max(1, Math.ceil(height / spacing));
    const columns = Math.max(2, Math.ceil(width / resolution));
    const output: Shape[] = [];
    const tau = Math.PI * 2;
    const phase = p.time * p.speed * tau;
    for (let row = 0; row <= rows; row++) {
      const y = y0 + row * spacing;
      const points: Vec2[] = [];
      let toneSum = 0, count = 0, inkSample: ReturnType<typeof sample> = null;
      const flush = () => {
        if (points.length < 2 || !count) { points.length = 0; toneSum = 0; count = 0; inkSample = null; return; }
        const tone = toneSum / count;
        const thickness = Math.max(0.1, p.width * (1 - p.weight + 2 * p.weight * tone));
        const sourceStyle = inkSample?.style;
        const stroke = sourceStyle?.fill && sourceStyle.fill !== 'none' ? sourceStyle.fill : sourceStyle?.stroke ?? '#111111';
        const style: Style = { fill: 'none', stroke, 'stroke-width': String(thickness), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
        if (sourceStyle?.opacity) style.opacity = sourceStyle.opacity;
        const segs = points.slice(1).map((point, i) => line(points[i]!, point));
        output.push({ style, subpaths: [{ start: points[0]!, segs, closed: false }], clone: output.length });
        points.length = 0; toneSum = 0; count = 0; inkSample = null;
      };

      for (let col = 0; col <= columns; col++) {
        const x = Math.min(x1, x0 + col * resolution);
        const hit = sample([x, y]);
        if (!hit) { flush(); continue; }
        let tone = darkness(hit.rgba);
        if (p.invert) tone = 1 - tone;
        tone = Math.max(0, Math.min(1, Math.pow(tone, p.gamma)));
        const wave = Math.sin((x / p.wavelength) * tau + phase + row * 0.19);
        const displacedY = y + (tone - 0.5) * p.amplitude + wave * p.amplitude * tone * 0.42;
        // The line may move, but it must still follow the sampled silhouette.
        const displaced = sample([x, displacedY]);
        if (!displaced) { flush(); continue; }
        points.push([x, displacedY]);
        toneSum += tone; count++;
        inkSample ??= hit;
      }
      flush();
    }
    return { viewBox: geo.viewBox, shapes: output };
  },
});
