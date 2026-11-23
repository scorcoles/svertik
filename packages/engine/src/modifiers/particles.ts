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
    time: { type: 'number', default: 1, defaultExpr: 'scene.time', min: 0, step: 0.01, label: 'Time (s)' },
    emission: { type: 'enum', default: 'burst', options: ['burst', 'stream'], label: 'Emission', animatable: false },
    count: { type: 'number', default: 64, min: 1, max: 512, step: 1, label: 'Count', ramp: false },
    lifetime: { type: 'number', default: 3, min: 0.05, max: 30, step: 0.05, label: 'Lifetime (s)', ramp: false },
    lifetimeRandom: { type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: 'Life variation', ramp: false },
    rate: { type: 'number', default: 0, min: 0, max: 2000, step: 1, label: 'Birth rate (0 = auto)', unit: '/s', ramp: false, showIf: { emission: ['stream'] } },
    prewarm: { type: 'boolean', default: false, label: 'Prewarm', animatable: false, showIf: { emission: ['stream'] } },
    seed: { type: 'seed', default: 1 },
    center: { type: 'point', default: [0.5, 0.5], unit: 'fraction', label: 'Position', group: 'Emitter' },
    emitter: { type: 'enum', default: 'circle', options: ['point', 'line', 'box', 'circle'], label: 'Shape', group: 'Emitter', animatable: false },
    area: { type: 'point', default: [0.15, 0.15], unit: 'fraction', label: 'Area', handle: false, min: 0, group: 'Emitter', showIf: { emitter: ['line', 'box', 'circle'] } },
    referenceSize: { type: 'number', default: 0, min: 0, step: 1, unit: 'px', label: 'Reference size (0 = source)', group: 'Emitter', ramp: false },
    motion: { type: 'enum', default: 'free', options: ['free', 'impulse'], label: 'Motion', group: 'Motion', animatable: false, showIf: { emission: ['burst'] } },
    direction: { type: 'angle', default: -90, label: 'Direction', group: 'Motion', ramp: false },
    spread: { type: 'number', default: 90, min: 0, max: 360, step: 1, label: 'Spread (°)', group: 'Motion', ramp: false },
    speed: { type: 'number', default: 0.8, min: 0, max: 5, step: 0.01, unit: 'fraction', label: 'Speed', group: 'Motion' },
    speedRandom: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'Speed variation', group: 'Motion', ramp: false },
    spin: { type: 'angle', default: 180, label: 'Spin', group: 'Motion', ramp: false },
    gravity: { type: 'number', default: 0.6, min: 0, max: 5, step: 0.01, unit: 'fraction', label: 'Gravity', group: 'Motion' },
    wind: { type: 'point', default: [0, 0], unit: 'fraction', label: 'Wind', group: 'Motion', handle: false },
    drag: { type: 'number', default: 0, min: 0, max: 20, step: 0.05, label: 'Drag', group: 'Motion', ramp: false },
    turbulence: { type: 'number', default: 0, min: 0, max: 2, step: 0.01, label: 'Turbulence', group: 'Motion', ramp: false },
    turbulenceFrequency: { type: 'number', default: 0.5, min: 0.05, max: 5, step: 0.05, unit: 'Hz', label: 'Turbulence frequency', group: 'Motion', ramp: false },
    swirl: { type: 'angle', default: 0, label: 'Swirl (°/s)', group: 'Motion', ramp: false },
    alignToMotion: { type: 'boolean', default: false, label: 'Align to motion', group: 'Motion', animatable: false },
    // Motion streaks: each particle lengthens along its direction of travel, in proportion to its speed.
    stretch: { type: 'number', default: 0, min: 0, max: 5, step: 0.05, label: 'Stretch by speed', group: 'Appearance', ramp: false },
    size: { type: 'number', default: 0.05, min: 0.001, max: 1, step: 0.001, unit: 'fraction', label: 'Size', group: 'Appearance' },
    sizeRandom: { type: 'number', default: 0.6, min: 0, max: 1, step: 0.01, label: 'Size variation', group: 'Appearance', ramp: false },
    rotationRandom: { type: 'angle', default: 360, label: 'Rotation variation', group: 'Appearance', ramp: false },
    fade: { type: 'number', default: 0.2, min: 0, max: 1, step: 0.01, label: 'Fade out', group: 'Appearance', ramp: false },
    fadeIn: { type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: 'Fade in', group: 'Appearance', ramp: false },
    sizeEnd: { type: 'number', default: 1, min: 0, max: 5, step: 0.05, label: 'End size ×', group: 'Appearance', ramp: false },
    keepSource: { type: 'boolean', default: false, label: 'Keep source', group: 'Appearance', animatable: false },
  },
  apply(geo, p, ctx) {
    const size = p.referenceSize > 0 ? p.referenceSize : Math.max(ctx.bounds.width, ctx.bounds.height) || 1;
    const stream = p.emission === 'stream';
    const time = Math.max(0, p.time) + (stream && p.prewarm ? Math.max(0.05, p.lifetime) : 0);
    const lifetime = Math.max(0.05, p.lifetime);
    const physical = !stream && p.motion === 'impulse';
    const position = fromFraction(ctx.bounds, p.center);
    const source = p.keepSource ? geo.shapes.map((s) => ({ ...s, clone: -1 })) : [];
    if (!geo.shapes.length || (!stream && time >= lifetime)) return { viewBox: geo.viewBox, shapes: source };
    const complexity = geo.shapes.reduce((sum, shape) => sum + shape.subpaths.reduce((n, path) => n + path.segs.length + 1, 0), 0);
    // Keep a complex source object from multiplying into an unbounded SVG.
    const count = Math.max(1, Math.min(512, Math.floor(p.count), Math.floor(100000 / Math.max(1, complexity))));
    const interval = stream && p.rate > 0 ? 1 / Math.min(2000, p.rate) : lifetime / count;
    const last = stream ? Math.floor(time / interval + 1e-9) : count - 1;
    const first = stream ? Math.max(0, last - count + 1, Math.ceil((time - lifetime) / interval - 1e-9)) : 0;
    const out: Shape[] = [...source];
    const base = geo;
    const b = bounds(base);
    const ref = { cx: b.x + b.width / 2, cy: b.y + b.height / 2, extent: Math.max(b.width, b.height) || 1 };
    const births = Math.max(0, Math.min(count, last - first + 1));
    for (let slot = 0; slot < births; slot++) {
      const i = first + slot;
      const age = time - (stream ? i * interval : 0);
      if (age < -1e-9 || age >= lifetime) continue;
      const random = rng((p.seed >>> 0) ^ Math.imul(i + 1, 0x9e3779b1));
      // Consume the same random draws for all emitter kinds, so changing area doesn't reshuffle speeds.
      const u = random(), v = random();
      const ax = Math.max(0, p.area[0]) * (p.referenceSize > 0 ? size : ctx.bounds.width), ay = Math.max(0, p.area[1]) * (p.referenceSize > 0 ? size : ctx.bounds.height);
      let x = position[0], y = position[1];
      if (p.emitter === 'circle') { const radius = Math.sqrt(u), angle = v * Math.PI * 2; x += Math.cos(angle) * radius * ax / 2; y += Math.sin(angle) * radius * ay / 2; }
      else if (p.emitter === 'line') x += (u - 0.5) * ax;
      else if (p.emitter === 'box') { x += (u - 0.5) * ax; y += (v - 0.5) * ay; }
      const angle = deg(p.direction + (random() - 0.5) * Math.min(360, Math.max(0, p.spread)));
      const speed = Math.max(0, p.speed) * size * (1 - Math.min(1, Math.max(0, p.speedRandom)) * random());
      const vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed;
      const spin = deg(p.spin) * (random() * 2 - 1);
      let scale = Math.max(0.001, p.size) * size * (1 - Math.min(1, Math.max(0, p.sizeRandom)) * random()) / ref.extent;
      const initialRotation = deg(p.rotationRandom) * (random() - 0.5);
      // New randomness is appended to the legacy draw sequence to keep existing scenes identical.
      const life = Math.max(0.05, lifetime * (1 - Math.min(1, Math.max(0, p.lifetimeRandom)) * random()));
      if (age >= life) continue;
      const progress = Math.max(0, Math.min(1, age / life));
      const phaseX = random() * Math.PI * 2, phaseY = random() * Math.PI * 2;
      const frequency = Math.max(0.05, p.turbulenceFrequency) * Math.PI * 2;
      const damping = Math.max(0, p.drag), acceleration = Math.max(0, p.gravity) * size;
      const originX = x, originY = y;
      // Closed-form motion can be sought in any order, with no integration history or warm-up cache.
      const positionAt = (a: number): Vec2 => {
        const travel = damping > 1e-6 ? -Math.expm1(-damping * a) / damping : a;
        const fall = damping > 1e-6 ? (a - travel) / damping : a * a / 2;
        const angle = deg(p.swirl) * a, cs = Math.cos(angle), sn = Math.sin(angle);
        const dx = vx * travel, dy = vy * travel;
        const envelope = -Math.expm1(-frequency * a);
        const wander = Math.max(0, p.turbulence) * size * envelope;
        return [originX + dx * cs - dy * sn + p.wind[0] * size * a + wander * (Math.sin(frequency*a + phaseX) - Math.sin(phaseX)),
          originY + dx * sn + dy * cs + acceleration * fall + p.wind[1] * size * a + wander * (Math.sin(frequency*a*.79 + phaseY) - Math.sin(phaseY))];
      };
      let rotation = initialRotation + (physical ? 0 : spin * Math.max(0, age));
      // The streak: a stretch of `along` (1 = none) on the axis (ux, uy) of travel.
      let along = 1, ux = 1, uy = 0;
      if (!physical) {
        [x, y] = positionAt(Math.max(0, age));
        if (p.alignToMotion || p.stretch > 0) {
          const next = positionAt(Math.max(0, age) + 0.001);
          const step = Math.hypot(next[0]-x, next[1]-y);
          if (step > 1e-9) {
            if (p.alignToMotion) rotation += Math.atan2(next[1]-y, next[0]-x);
            // Stretch 1 doubles the length at a speed of one reference size per second.
            along = 1 + Math.max(0, p.stretch) * (step / 0.001) / size;
            ux = (next[0]-x) / step; uy = (next[1]-y) / step;
          }
        }
      }
      scale *= 1 + (Math.max(0, p.sizeEnd) - 1) * progress;
      const c = Math.cos(rotation) * scale, s = Math.sin(rotation) * scale;
      const fadeOut = p.fade <= 0 ? 1 : Math.min(1, Math.max(0, (life - age) / (life * Math.min(1, p.fade))));
      const opacity = fadeOut * (p.fadeIn <= 0 ? 1 : Math.min(1, Math.max(0, age / (life * Math.min(1, p.fadeIn)))));
      const k = along - 1;
      const moved = mapPoints(base, ([px, py]): Vec2 => {
        const lx = (px - ref.cx) * c - (py - ref.cy) * s, ly = (px - ref.cx) * s + (py - ref.cy) * c;
        // Lengthen along the direction of travel only (the across-width stays).
        const d = (lx * ux + ly * uy) * k;
        return [x + lx + d * ux, y + ly + d * uy];
      });
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
