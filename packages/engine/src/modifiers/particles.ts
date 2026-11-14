import { bounds, mapPoints, type Geometry, type Shape, type Vec2 } from '../geometry';
import { defineModifier, deg, fromFraction } from '../modifier';
import { rng } from '../random';

/** Independent seeded births: evaluating frame N never needs to visit the earlier frames. */
export const particles = defineModifier({
  type: 'particles',
  label: 'Particles',
  kind: 'generator',
  // Keep the emitter's reference box stable for Gravity and other following effects.
  params: {
    time: { type: 'number', default: 1, min: 0, max: 60, step: 0.01, label: 'Time (s)' },
    emission: { type: 'enum', default: 'burst', options: ['burst', 'stream'], label: 'Emission', animatable: false },
    count: { type: 'number', default: 64, min: 1, max: 512, step: 1, label: 'Count', ramp: false },
    lifetime: { type: 'number', default: 3, min: 0.05, max: 30, step: 0.05, label: 'Lifetime (s)', ramp: false },
    seed: { type: 'seed', default: 1 },
    center: { type: 'point', default: [0.5, 0.5], unit: 'fraction', label: 'Position', group: 'Emitter' },
    emitter: { type: 'enum', default: 'circle', options: ['point', 'line', 'box', 'circle'], label: 'Shape', group: 'Emitter', animatable: false },
    area: { type: 'point', default: [0.15, 0.15], unit: 'fraction', label: 'Area', handle: false, min: 0, group: 'Emitter', showIf: { emitter: ['line', 'box', 'circle'] } },
    motion: { type: 'enum', default: 'free', options: ['free', 'impulse'], label: 'Motion', group: 'Motion', animatable: false, showIf: { emission: ['burst'] } },
    direction: { type: 'angle', default: -90, label: 'Direction', group: 'Motion', ramp: false },
    spread: { type: 'number', default: 90, min: 0, max: 360, step: 1, label: 'Spread (°)', group: 'Motion', ramp: false },
    speed: { type: 'number', default: 0.8, min: 0, max: 5, step: 0.01, unit: 'fraction', label: 'Speed', group: 'Motion' },
    speedRandom: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'Speed variation', group: 'Motion', ramp: false },
    spin: { type: 'angle', default: 180, label: 'Spin', group: 'Motion', ramp: false },
    gravity: { type: 'number', default: 0.6, min: 0, max: 5, step: 0.01, unit: 'fraction', label: 'Gravity', group: 'Motion' },
    size: { type: 'number', default: 0.05, min: 0.001, max: 1, step: 0.001, unit: 'fraction', label: 'Size', group: 'Appearance' },
    sizeRandom: { type: 'number', default: 0.6, min: 0, max: 1, step: 0.01, label: 'Size variation', group: 'Appearance', ramp: false },
    rotationRandom: { type: 'angle', default: 360, label: 'Rotation variation', group: 'Appearance', ramp: false },
    fade: { type: 'number', default: 0.2, min: 0, max: 1, step: 0.01, label: 'Fade out', group: 'Appearance', ramp: false },
    keepSource: { type: 'boolean', default: false, label: 'Keep source', group: 'Appearance', animatable: false },
  },
  apply(geo, p, ctx) {
    const size = Math.max(ctx.bounds.width, ctx.bounds.height) || 1;
    const time = Math.min(60, Math.max(0, p.time));
    const lifetime = Math.max(0.05, p.lifetime);
    const stream = p.emission === 'stream';
    const physical = !stream && p.motion === 'impulse';
    const position = fromFraction(ctx.bounds, p.center);
    const source = p.keepSource ? geo.shapes.map((s) => ({ ...s, clone: -1 })) : [];
    if (!geo.shapes.length || (!stream && time >= lifetime)) return { viewBox: geo.viewBox, shapes: source };
    const complexity = geo.shapes.reduce((sum, shape) => sum + shape.subpaths.reduce((n, path) => n + path.segs.length + 1, 0), 0);
    // Keep a complex source object from multiplying into an unbounded SVG.
    const count = Math.max(1, Math.min(512, Math.floor(p.count), Math.floor(100000 / Math.max(1, complexity))));
    const interval = lifetime / count;
    const last = stream ? Math.floor(time / interval + 1e-9) : count - 1;
    const first = stream ? Math.max(0, last - count + 1) : 0;
    const out: Shape[] = [...source];
    const base = geo;
    const b = bounds(base);
    const ref = { cx: b.x + b.width / 2, cy: b.y + b.height / 2, extent: Math.max(b.width, b.height) || 1 };
    for (let i = first; i <= last; i++) {
      const age = time - (stream ? i * interval : 0);
      if (age < -1e-9 || age >= lifetime) continue;
      const random = rng((p.seed >>> 0) ^ Math.imul(i + 1, 0x9e3779b1));
      // Consume the same random draws for all emitter kinds, so changing area doesn't reshuffle speeds.
      const u = random(), v = random();
      const ax = Math.max(0, p.area[0]) * ctx.bounds.width, ay = Math.max(0, p.area[1]) * ctx.bounds.height;
      let x = position[0], y = position[1];
      if (p.emitter === 'circle') { const radius = Math.sqrt(u), angle = v * Math.PI * 2; x += Math.cos(angle) * radius * ax / 2; y += Math.sin(angle) * radius * ay / 2; }
      else if (p.emitter === 'line') x += (u - 0.5) * ax;
      else if (p.emitter === 'box') { x += (u - 0.5) * ax; y += (v - 0.5) * ay; }
      const angle = deg(p.direction + (random() - 0.5) * Math.min(360, Math.max(0, p.spread)));
      const speed = Math.max(0, p.speed) * size * (1 - Math.min(1, Math.max(0, p.speedRandom)) * random());
      const vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed;
      const spin = deg(p.spin) * (random() * 2 - 1);
      const scale = Math.max(0.001, p.size) * size * (1 - Math.min(1, Math.max(0, p.sizeRandom)) * random()) / ref.extent;
      const initialRotation = deg(p.rotationRandom) * (random() - 0.5);
      const rotation = initialRotation + (physical ? 0 : spin * Math.max(0, age));
      if (!physical) { x += vx * age; y += vy * age + Math.max(0, p.gravity) * size * age * age / 2; }
      const c = Math.cos(rotation) * scale, s = Math.sin(rotation) * scale;
      const opacity = p.fade <= 0 ? 1 : Math.min(1, Math.max(0, (lifetime - age) / (lifetime * Math.min(1, p.fade))));
      const moved = mapPoints(base, ([px, py]): Vec2 => [x + (px - ref.cx) * c - (py - ref.cy) * s, y + (px - ref.cx) * s + (py - ref.cy) * c]);
      for (const shape of moved.shapes) {
        // The source is the template: all of its paths form one particle, owned by this emitter.
        const { node: _node, clone: _clone, impulse: _impulse, word: _word, line: _line, ...part } = shape;
        const style = { ...shape.style };
        if (opacity < 1) style.opacity = String(Number(style.opacity ?? 1) * opacity);
        if (style['stroke-width'] && Number.isFinite(Number(style['stroke-width']))) style['stroke-width'] = String(Number(style['stroke-width']) * scale);
        out.push({ ...part, style, clone: i, ...(physical ? { impulse: { velocity: [vx, vy] as Vec2, spin } } : {}) });
      }
    }
    return { viewBox: geo.viewBox, shapes: out, ...(geo.inner ? { inner: geo.inner } : {}), ...(geo.filters ? { filters: geo.filters } : {}) };
  },
});
