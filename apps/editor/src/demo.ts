// Second demo: a triangle (point down) grows from nothing, cracks, trembles, bursts with a
// flash and a shockwave, and its pieces spin away. 6 s loop.
export function shatterProject() {
  const k = (t: number, value: unknown, ease = 'linear') => ({ t, value, ease });
  return {
    svertik: 'project',
    version: 1,
    name: 'svertik shatter',
    scene: {
      version: 1,
      background: '#0b0b0e',
      objects: [
        // Impact flash, in front of everything (almost always transparent).
        { kind: 'shape', id: 'flash', name: 'Flash', shape: 'rectangle', params: { width: 1300, height: 860, fillColor: '#ffffff' }, stack: [], opacity: 0 },
        {
          kind: 'shape',
          id: 'caption',
          name: 'Caption',
          shape: 'text',
          params: { text: 'IMPACT', font: 'Commit Mono', weight: 700, size: 28, tracking: 700, fillColor: '#09fdd1' },
          transform: { y: 0 },
          stack: [
            {
              id: 'cap-in',
              type: 'stagger',
              params: { progress: 0, direction: 'in', stagger: 0.7, ease: 'expo-out', order: 'center' },
              children: [
                { id: 'cap-move', type: 'transform', params: { y: 18, rotation: 0, scale: 1 } },
                { id: 'cap-fade', type: 'opacity', params: { opacity: 0 } },
              ],
            },
          ],
        },
        // The impact shockwave.
        { kind: 'shape', id: 'wave', name: 'Shockwave', shape: 'ellipse', params: { width: 520, height: 520, fill: false, stroke: true, strokeColor: '#09fdd1', strokeWidth: 3 }, stack: [], opacity: 0 },
        {
          kind: 'shape',
          id: 'tri',
          name: 'Triangle',
          shape: 'polygon',
          params: { sides: 3, radius: 280, rotation: 180, fillColor: '#efefef' },
          transform: { scale: 0 },
          stack: [
            { id: 'tri-damage', type: 'damage', params: { seed: 7, growth: 0, cracks: 6, through: 6, length: 0.7, width: 0.011, chips: 9, chipSize: 0.035, specks: 60, speckSize: 0.006, roughness: 0.55 } },
            { id: 'tri-boom', type: 'explosion', params: { amount: 0, force: 1.1, spin: 260, shrink: 0.3, chaos: 0.75, center: [0.5, 0.42], seed: 3 } },
          ],
        },
        // Invisible frame (the canvas colour): fixes the framing even as the pieces fly off.
        { kind: 'shape', id: 'frame', name: 'Frame', shape: 'rectangle', params: { width: 1300, height: 860, fillColor: '#0b0b0e' }, stack: [] },
      ],
      animation: {
        duration: 6,
        loop: true,
        fps: 30,
        tracks: [
          // Entry: grows with a bounce and turns into place.
          { id: 's-scale', node: 'tri', on: 'node', param: 'scale', keys: [k(0, 0, 'back-out'), k(0.9, 1)] },
          { id: 's-rot', node: 'tri', on: 'node', param: 'rotation', keys: [k(0, -40, 'expo-out'), k(0.9, 0)] },
          // It cracks.
          { id: 's-growth', node: 'tri', on: 'modifier', modifier: 'tri-damage', param: 'growth', keys: [k(0.9, 0, 'ease-in'), k(2.1, 1)] },
          // Tiembla justo antes de romper.
          { id: 's-shake', node: 'tri', on: 'node', param: 'x', keys: [k(1.95, 0), k(2.02, -7), k(2.09, 6), k(2.16, -5), k(2.23, 4), k(2.3, 0)] },
          // It bursts: fast at first, then the pieces keep drifting.
          { id: 's-boom', node: 'tri', on: 'modifier', modifier: 'tri-boom', param: 'amount', keys: [k(2.3, 0, 'expo-out'), k(3, 0.7), k(5.6, 1)] },
          { id: 's-fade', node: 'tri', on: 'node', param: 'opacity', keys: [k(4.9, 1, 'ease-in'), k(5.7, 0)] },
          // Flash and shockwave.
          { id: 's-flash', node: 'flash', on: 'node', param: 'opacity', keys: [k(2.28, 0), k(2.32, 0.35, 'expo-out'), k(2.75, 0)] },
          { id: 's-wave-scale', node: 'wave', on: 'node', param: 'scale', keys: [k(2.3, 0.2, 'expo-out'), k(3.1, 2.4)] },
          { id: 's-wave-op', node: 'wave', on: 'node', param: 'opacity', keys: [k(2.29, 0), k(2.31, 1, 'ease-out'), k(3.1, 0)] },
          // The caption.
          { id: 's-cap', node: 'caption', on: 'modifier', modifier: 'cap-in', param: 'progress', keys: [k(2.9, 0), k(3.8, 1)] },
          { id: 's-cap-out', node: 'caption', on: 'node', param: 'opacity', keys: [k(5, 1, 'ease-in'), k(5.6, 0)] },
        ],
      },
    },
  };
}


// Title sequence: a title card played like a tape. The card is a composition with its own clock (title
// letters rising through a perspective floor, a rule drawing itself, a typed subtitle, a timecode); the
// parent drives that clock with keys: play, freeze, rewind, play out. Glitch effects on the composition
// and the HUD read the tape state from custom variables. 9 s loop on a 1280 × 720 document.
export function titleSequenceProject() {
  const k = (t: number, value: unknown, ease = 'linear') => ({ t, value, ease });
  const expr = (source: string, fallback = 0) => ({ $expr: source, fallback });
  const ink = '#efefef', dim = '#8a8a93', accent = '#09fdd1', hot = '#ff2bd6', stage = '#0b0b0e';
  const mono = { font: 'Commit Mono' };

  // The card: what the tape holds. 6 s of local time.
  const card = {
    version: 1,
    notes: 'The title card. Its clock is driven by the parent: open it to edit the letters, the rule or the subtitle on their own timeline.',
    document: { width: 1280, height: 720 },
    objects: [
      {
        kind: 'shape', id: 'timecode', name: 'Timecode', shape: 'text',
        params: { ...mono, text: 'TC 00:{{fixed(scene.time, 2, 2)}}', size: 16, tracking: 200, align: 'left', anchor: 'left', fillColor: dim },
        transform: { x: -580, y: 300 }, stack: [],
      },
      {
        kind: 'shape', id: 'title', name: 'Title', shape: 'text',
        params: { ...mono, text: 'SVERTIK', weight: 700, size: 168, tracking: 160, fillColor: ink },
        transform: { y: -40 },
        stack: [
          { id: 'title-in', type: 'stagger', params: { progress: 0, direction: 'in', stagger: 0.6, ease: 'back-out', order: 'center' }, children: [
            { id: 'title-in-move', type: 'transform', params: { y: 90, scale: 0.6 } },
            { id: 'title-in-fade', type: 'opacity', params: { opacity: 0 } },
          ] },
          { id: 'title-out', type: 'stagger', params: { progress: 0, direction: 'out', stagger: 0.5, ease: 'expo-in', order: 'edges' }, children: [
            { id: 'title-out-move', type: 'transform', params: { y: -70, scale: 1.1 } },
            { id: 'title-out-fade', type: 'opacity', params: { opacity: 0 } },
          ] },
          { id: 'title-floor', type: 'perspective', params: { topLeft: [0.34, 0], topRight: [0.66, 0], bottomRight: [1, 1], bottomLeft: [0, 1] } },
        ],
      },
      {
        kind: 'shape', id: 'rule', name: 'Rule', shape: 'line',
        params: { length: 760, strokeColor: accent, strokeWidth: 2, strokeCap: 'butt' },
        transform: { y: 72 },
        stack: [{ id: 'rule-draw', type: 'trim', params: { start: 0, end: 0, offset: 0 } }],
      },
      {
        kind: 'shape', id: 'subtitle', name: 'Subtitle', shape: 'text',
        params: { ...mono, text: 'PROCEDURAL MOTION GRAPHICS', size: 18, tracking: 520, fillColor: dim },
        transform: { y: 116 },
        stack: [
          { id: 'sub-type', type: 'stagger', params: { progress: 0, direction: 'in', stagger: 1, ease: 'linear', order: 'forward' }, children: [
            { id: 'sub-type-fade', type: 'opacity', params: { opacity: 0 } },
          ] },
        ],
      },
    ],
    animation: {
      duration: 6, loop: false, fps: 30,
      markers: [{ id: 'card-in', name: 'In', t: 0.3 }, { id: 'card-out', name: 'Out', t: 4.4 }],
      tracks: [
        { id: 'c-title-in', node: 'title', on: 'modifier', modifier: 'title-in', param: 'progress', keys: [k(0.3, 0), k(1.5, 1)] },
        { id: 'c-floor-l', node: 'title', on: 'modifier', modifier: 'title-floor', param: 'topLeft', keys: [k(0.3, [0.34, 0], 'expo-out'), k(1.8, [0, 0])] },
        { id: 'c-floor-r', node: 'title', on: 'modifier', modifier: 'title-floor', param: 'topRight', keys: [k(0.3, [0.66, 0], 'expo-out'), k(1.8, [1, 0])] },
        { id: 'c-rule-in', node: 'rule', on: 'modifier', modifier: 'rule-draw', param: 'end', keys: [k(0.9, 0, 'expo-out'), k(1.8, 1)] },
        { id: 'c-sub-in', node: 'subtitle', on: 'modifier', modifier: 'sub-type', param: 'progress', keys: [k(1.6, 0), k(2.8, 1)] },
        { id: 'c-title-out', node: 'title', on: 'modifier', modifier: 'title-out', param: 'progress', keys: [k(4.4, 0), k(5.3, 1)] },
        { id: 'c-rule-out', node: 'rule', on: 'modifier', modifier: 'rule-draw', param: 'start', keys: [k(4.5, 0, 'expo-in'), k(5.2, 1)] },
        { id: 'c-sub-out', node: 'subtitle', on: 'node', param: 'opacity', keys: [k(4.4, 1, 'ease-in'), k(4.9, 0)] },
      ],
    },
  };

  const hud = (id: string, name: string, text: string, x: number, opacity: unknown, color = dim, anchor = 'left') => ({
    kind: 'shape', id, name, shape: 'text',
    params: { ...mono, text, size: 16, tracking: 200, align: anchor, anchor, fillColor: color },
    transform: { x, y: -300 }, opacity, stack: [],
  });

  const scene = {
    version: 1,
    notes: 'Title Sequence. The title card is a composition (open it to edit). The parent keys its Time: it plays, freezes at 3 s, rewinds to 0.9 s and plays out, so the card\'s own timecode runs backwards during the rewind. Custom variables `freeze` and `rewind` (0/1, from scene.time) drive the RGB split and Slices on the composition, the tape-tracking bar and the HUD labels. Retime the tape by moving the composition keys and the edges in those two variables.',
    document: { width: 1280, height: 720 },
    custom: {
      freeze: expr('step(3, scene.time) * (1 - step(3.5, scene.time))'),
      rewind: expr('step(3.5, scene.time) * (1 - step(4.3, scene.time))'),
    },
    objects: [
      hud('rec', 'REC', 'REC', -560, expr('step(0.5, mod(scene.time, 1))', 1), hot),
      { kind: 'shape', id: 'rec-dot', name: 'REC dot', shape: 'ellipse', params: { width: 12, height: 12, fillColor: hot }, transform: { x: -580, y: -300 }, opacity: expr('step(0.5, mod(scene.time, 1))', 1), stack: [] },
      hud('st-play', 'Play label', 'PLAY >', 580, expr('1 - scene.custom.freeze - scene.custom.rewind', 1), dim, 'right'),
      hud('st-pause', 'Pause label', 'PAUSE ||', 580, expr('scene.custom.freeze'), ink, 'right'),
      hud('st-rewind', 'Rewind label', '<< REWIND', 580, expr('scene.custom.rewind'), accent, 'right'),
      // The tape-tracking bar that rolls through the picture while rewinding.
      {
        kind: 'shape', id: 'tracking', name: 'Tracking bar', shape: 'rectangle',
        params: { width: 1280, height: 34, fillColor: '#ffffff' },
        transform: { y: expr('mod(scene.time * 1100, 760) - 380') },
        opacity: expr('scene.custom.rewind * 0.07'),
        stack: [{ id: 'tracking-noise', type: 'slices', params: { count: 6, chance: 0.8, shift: 0.02, seed: expr('floor(scene.time * 20)', 1) } }],
      },
      {
        kind: 'group', id: 'tape', name: 'Title card', children: [],
        stack: [
          { id: 'tape-slices', type: 'slices', params: {
            // One band (no seams) while the tape plays; many while it freezes or rewinds.
            count: expr('1 + scene.custom.rewind * 27 + scene.custom.freeze * 11', 1), seed: expr('floor(scene.time * 15)', 1),
            chance: expr('scene.custom.rewind * 0.6 + scene.custom.freeze * 0.12'),
            shift: expr('scene.custom.rewind * 0.07 + scene.custom.freeze * 0.015'),
          } },
          { id: 'tape-split', type: 'rgbsplit', params: {
            mode: 'duo', colorA: accent, colorB: hot, layer: 'behind', original: true, angle: 0,
            distance: expr('scene.custom.rewind * 12 + scene.custom.freeze * 3'),
          } },
        ],
        composition: { scene: card, params: { time: 0, loop: 'hold' } },
      },
    ],
    animation: {
      duration: 9, loop: true, fps: 30,
      markers: [
        { id: 'm-freeze', name: 'Freeze', t: 3 },
        { id: 'm-rewind', name: 'Rewind', t: 3.5 },
        { id: 'm-play', name: 'Play', t: 4.3 },
      ],
      tracks: [
        { id: 'tape-time', node: 'tape', on: 'composition', param: 'time', keys: [k(0, 0), k(3, 3, 'hold'), k(3.5, 3, 'ease-in-out'), k(4.3, 0.9), k(9, 5.6)] },
      ],
    },
  };
  return { svertik: 'project', version: 1, name: 'svertik title sequence', scene: { ...scene, background: stage } };
}

// Playground: a kaleidoscope you paint with the pointer. Dragging emits sparks (Mouse Instance on `move`)
// that bloom and fade; two Mirrors on the generator's stack give four-way symmetry about the centre, and a
// palette picks a colour per emission. Holding longer grows the sparks (scene.mouse.downMs); a click sends a
// pulse; the dot grid behind swells around the pointer (Field following smooth(scene.mouse.frac…)) and the
// wheel resizes that swell. Infinite time: it never loops. Opens presenting.
export function playgroundProject() {
  const k = (t: number, value: unknown, ease = 'linear') => ({ t, value, ease });
  const expr = (source: string, fallback = 0) => ({ $expr: source, fallback });
  const ink = '#efefef', dim = '#6a6a73', accent = '#09fdd1', hot = '#ff2bd6', stage = '#0b0b0e';
  const palette = [accent, hot, '#ffd23f', '#4d8dff', ink];
  const mono = { font: 'Commit Mono' };
  // Four-way symmetry about the document centre: reflect across the vertical axis, then the horizontal one.
  const kaleido = (prefix: string) => [
    { id: `${prefix}-color`, type: 'color', params: { mode: 'palette', palette, paletteMode: 'random', seed: 3, target: 'both' } },
    { id: `${prefix}-mirror-x`, type: 'mirror', params: { reference: 'stage', axis: 'horizontal', position: 0.5, original: 'keep' } },
    { id: `${prefix}-mirror-y`, type: 'mirror', params: { reference: 'stage', axis: 'vertical', position: 0.5, original: 'keep' } },
  ];

  const scene = {
    version: 1,
    notes: 'Playground. Open Play: drag to paint (four-way symmetry), hold longer for bigger sparks, click for a pulse, scroll to resize the swell in the dot grid. Brush and Pulse are Mouse Instances; what each copy does (bloom, spin, fade) is the animation of its hidden source, Spark or Ring. Their stacks hold Color (palette per emission) and two Mirrors referencing the hidden Stage rectangle. The grid\'s Field follows smooth(scene.mouse.fracX/fracY) and drifts on its own while the pointer is outside. Headless renders show the idle grid only.',
    document: { width: 1280, height: 720 },
    fullViewport: true,
    clipToDocument: true,
    custom: {
      reach: expr('clamp(0.32 + scene.mouse.wheel * 0.03, 0.06, 0.9)', 0.32),
    },
    objects: [
      {
        kind: 'shape', id: 'hint', name: 'Hint', shape: 'text',
        params: { ...mono, text: 'DRAG TO PAINT   HOLD TO GROW   CLICK TO PULSE   SCROLL TO RESIZE', size: 14, tracking: 300, fillColor: dim },
        transform: { y: 320 }, opacity: expr('1 - smoothstep(0, 1, scene.mouse.clicks)', 1), stack: [],
      },
      {
        kind: 'shape', id: 'counter', name: 'Counter', shape: 'text',
        params: { ...mono, text: '{{scene.mouse.clicks}} PULSES', size: 14, tracking: 300, align: 'right', anchor: 'right', fillColor: dim },
        transform: { x: 600, y: -320 }, stack: [],
      },
      { kind: 'instance', id: 'brush', name: 'Brush', of: 'spark', stack: kaleido('brush'), mouse: {
        event: 'move', button: 'left', rate: 40, distance: 16, count: 1, lifetime: 2.4, limit: 240,
        scale: expr('1 + min(scene.mouse.downMs / 1200, 1.6)', 1), scaleVariation: 0.35, rotationVariation: 180, scatter: 6,
      } },
      { kind: 'instance', id: 'pulse', name: 'Pulse', of: 'ring', stack: kaleido('pulse'), mouse: { event: 'click', count: 1, lifetime: 1.2, limit: 24 } },
      // Sources (hidden): what one copy does from its birth.
      {
        kind: 'shape', id: 'spark', name: 'Spark', shape: 'star', visible: false,
        params: { radius: 16, points: 4, inner: 0.32, fillColor: accent },
        stack: [],
      },
      {
        kind: 'shape', id: 'ring', name: 'Ring', shape: 'ellipse', visible: false,
        params: { width: 80, height: 80, fill: false, stroke: true, strokeColor: accent, strokeWidth: 2 },
        stack: [],
      },
      // The swell: a dot grid whose dots grow and light up around the pointer.
      {
        kind: 'shape', id: 'dots', name: 'Dot grid', shape: 'ellipse',
        params: { width: 4, height: 4, fillColor: '#2e2e36' },
        stack: [
          { id: 'dots-grid', type: 'clone', params: { mode: 'grid', columns: 33, rows: 19, spacing: [10, 10] } },
          { id: 'dots-swell', type: 'field', params: {
            shape: 'circle', contain: 'center', softness: 1, amount: 1,
            // With the pointer away, the swell drifts on its own (also what the thumbnail shows).
            center: [
              expr('smooth(lerp(0.5 + 0.3 * sin(scene.time * 0.7), scene.mouse.fracX, scene.mouse.inside), 0.25)', 0.5),
              expr('smooth(lerp(0.5 + 0.25 * sin(scene.time * 1.1), scene.mouse.fracY, scene.mouse.inside), 0.25)', 0.5),
            ],
            width: expr('scene.custom.reach', 0.32), height: expr('scene.custom.reach', 0.32),
          }, children: [
            { id: 'dots-swell-scale', type: 'transform', params: { scale: 3.2 } },
            { id: 'dots-swell-tint', type: 'color', params: { mode: 'solid', color: '#1fa595', target: 'fill' } },
          ] },
        ],
      },
      // Reference for the Mirrors: the document's own rectangle.
      { kind: 'shape', id: 'stage', name: 'Stage', shape: 'rectangle', visible: false, params: { width: 1280, height: 720, fillColor: stage }, stack: [] },
    ],
    animation: {
      duration: 4, loop: false, infinite: true, fps: 60,
      tracks: [
        { id: 'spark-scale', node: 'spark', on: 'node', param: 'scale', keys: [k(0, 0, 'back-out'), k(0.25, 1, 'ease-in'), k(2.4, 0.2)] },
        { id: 'spark-spin', node: 'spark', on: 'node', param: 'rotation', keys: [k(0, 0, 'ease-out'), k(2.4, 220)] },
        { id: 'spark-fade', node: 'spark', on: 'node', param: 'opacity', keys: [k(0.9, 1, 'ease-in'), k(2.4, 0)] },
        { id: 'ring-scale', node: 'ring', on: 'node', param: 'scale', keys: [k(0, 0.2, 'expo-out'), k(1.2, 5)] },
        { id: 'ring-fade', node: 'ring', on: 'node', param: 'opacity', keys: [k(0, 1, 'ease-out'), k(1.2, 0)] },
      ],
    },
  };
  return { svertik: 'project', version: 1, name: 'svertik playground', scene: { ...scene, background: stage } };
}

// Orrery: clockwork against real dynamics around one sun. Three planets run on flattened orbits with
// Follow Path (position from scene.time, inner ones faster), each drawing a Trace; a Connect line joins
// the inner and outer planets. Around the sun, which is an immovable attractor in a Physics group, a
// handful of rocks thrown sideways fall into genuine orbits that precess and collide. Behind it all, a
// field of needles (Clone + Range + Look At) keeps pointing at the outer planet. Infinite time.
export function orreryProject() {
  const expr = (source: string, fallback = 0) => ({ $expr: source, fallback });
  const ink = '#efefef', dim = '#6a6a73', line = '#24242b', accent = '#09fdd1', hot = '#ff2bd6', sun = '#ffd23f', blue = '#4d8dff', stage = '#0b0b0e';
  const mono = { font: 'Commit Mono' };
  const orbit = (id: string, name: string, width: number, height: number, dashed = false) => ({
    kind: 'shape', id, name, shape: 'ellipse',
    params: { width, height, fill: false, stroke: true, strokeColor: line, strokeWidth: 1, ...(dashed ? { dash: 2, gap: 8 } : {}) },
    transform: { rotation: -8 }, stack: [],
  });
  // A planet on its orbit: `period` seconds per turn, `phase` where it starts (0–1).
  const planet = (id: string, name: string, path: string, size: number, color: string, period: number, phase: number) => ({
    kind: 'shape', id, name, shape: 'ellipse',
    params: { width: size, height: size, fillColor: color },
    stack: [
      { id: `${id}-path`, type: 'followpath', params: { target: path, orient: false, position: expr(`mod(scene.time / ${period} + ${phase}, 1)`, phase) } },
      { id: `${id}-glow`, type: 'glow', params: { size: size * 0.6, color, strength: 0.9 } },
    ],
  });
  const trail = (id: string, of: string, color: string, length: number) => ({
    kind: 'shape', id, name: `${of} trail`, shape: 'line',
    params: { strokeColor: color, strokeWidth: 1.5 }, opacity: 0.55,
    stack: [{ id: `${id}-trace`, type: 'trace', params: { target: of, length, samples: 90, smooth: true } }],
  });
  const rock = (id: string, sides: number, radius: number, x: number, y: number, velocity: [number, number], spin: number) => ({
    kind: 'shape', id, name: `Rock ${id.slice(-1)}`, shape: 'polygon',
    params: { sides, radius, fillColor: ink },
    transform: { x, y },
    stack: [{ id: `${id}-body`, type: 'rigidbody', params: { velocity, spin } }],
  });

  const scene = {
    version: 1,
    notes: 'Orrery. Clockwork: Inner, Middle and Outer follow their orbit paths with Follow Path, position = mod(scene.time / period + phase, 1); change a period to retune. Physics: the Sun is an immovable Rigid Body attractor, and the rocks only get an initial sideways velocity; their orbits, precession and collisions are simulated. The needle field is Clone + Range + Look At aimed at Outer. 30 s loop: the periods (6, 10, 30 s) divide it, so the clockwork loops seamlessly; Physics restarts at the loop point, hidden by a fade of the Gravity well.',
    document: { width: 1280, height: 720 },
    objects: [
      { kind: 'shape', id: 'kicker', name: 'Kicker', shape: 'text', params: { ...mono, text: 'ORRERY   CLOCKWORK / DYNAMICS', size: 14, tracking: 300, align: 'left', anchor: 'left', fillColor: dim }, transform: { x: -600, y: -320 }, stack: [] },
      { kind: 'shape', id: 'clock', name: 'Clock', shape: 'text', params: { ...mono, text: 'T+{{fixed(scene.time, 1, 3)}}', size: 14, tracking: 300, align: 'right', anchor: 'right', fillColor: dim }, transform: { x: 600, y: -320 }, stack: [] },
      {
        kind: 'group', id: 'well', name: 'Gravity well',
        // Physics simulates up to 60 s: the rocks fade out and back in at the loop point.
        opacity: expr('smoothstep(0, 0.8, scene.time) * (1 - smoothstep(29.2, 30, scene.time))', 1),
        stack: [{ id: 'well-sim', type: 'physics', params: { time: expr('scene.time'), acceleration: [0, 0], collisions: true, solids: [], friction: 0, bounce: 0.9 }, children: [] }],
        children: [
          rock('rock-1', 5, 9, 0.0, -180.0, [86.0, 0.0], 90),
          rock('rock-2', 4, 7, 173.2, 100.0, [-40.0, 69.3], -140),
          rock('rock-3', 6, 11, -199.2, 115.0, [-34.0, -58.9], 60),
          rock('rock-4', 3, 8, -130.0, -225.2, [53.7, -31.0], 200),
          rock('rock-5', 5, 6, 199.2, -115.0, [34.0, 58.9], -80),
          rock('rock-6', 4, 5, 130.0, 225.2, [-53.7, 31.0], 120),
          {
            kind: 'shape', id: 'sun', name: 'Sun', shape: 'ellipse',
            params: { width: 112, height: 112, fillColor: sun },
            stack: [
              { id: 'sun-body', type: 'rigidbody', params: { immovable: true, attractor: true, attractionStrength: 10, attractionRange: 0, attractionAbsorption: 0, attractionSleepThreshold: 0 } },
              { id: 'sun-glow', type: 'glow', params: { size: 36, color: sun, strength: 1.1 } },
            ],
          },
        ],
      },
      planet('inner', 'Inner', 'orbit-inner', 12, accent, 6, 0.1),
      planet('middle', 'Middle', 'orbit-middle', 18, hot, 10, 0.55),
      planet('outer', 'Outer', 'orbit-outer', 24, blue, 30, 0.3),
      trail('trail-inner', 'inner', accent, 2.5),
      trail('trail-middle', 'middle', hot, 4),
      trail('trail-outer', 'outer', blue, 6),
      {
        kind: 'shape', id: 'syzygy', name: 'Alignment', shape: 'line',
        params: { strokeColor: dim, strokeWidth: 1, dash: 3, gap: 6 },
        stack: [{ id: 'syzygy-link', type: 'connect', params: { from: 'inner', to: 'outer', shape: 'straight', edges: true, gap: 10 } }],
      },
      orbit('orbit-inner', 'Inner orbit', 420, 170),
      orbit('orbit-middle', 'Middle orbit', 720, 290),
      orbit('orbit-outer', 'Outer orbit', 1040, 420, true),
      {
        kind: 'shape', id: 'needles', name: 'Needle field', shape: 'rectangle',
        params: { width: 14, height: 2, fillColor: '#33333b' },
        stack: [
          // Spacing is in fractions of the needle's box (14 × 2): 50 px both ways.
          { id: 'needles-grid', type: 'clone', params: { mode: 'grid', columns: 26, rows: 15, spacing: [50 / 14, 25] } },
          { id: 'needles-each', type: 'range', params: { selector: 'all' }, children: [
            { id: 'needles-look', type: 'lookat', params: { target: 'outer', facing: 0, amount: 1 } },
          ] },
        ],
      },
    ],
    animation: { duration: 30, loop: true, fps: 30, tracks: [] },
  };
  return { svertik: 'project', version: 1, name: 'svertik orrery', scene: { ...scene, background: stage } };
}

// Print Lab: a risograph sheet that reprints itself. seedEvery gives scene.seedGenerator a new value every
// 2 s, and every placement, angle and screen size is a random() of it, so each beat is a new edition.
// Three inks overprint in multiply: a blue Halftone disc, a pink Crosshatch disc and a yellow Dithering
// slab, each shading a Gradient. Around them, a block of crosses clipped by a triangle (Clone + Mask), a
// Vector Grain stipple, registration marks in the four corners (one cross, two Mirrors) and paper Grain.
export function printLabProject() {
  const expr = (source: string, fallback = 0) => ({ $expr: source, fallback });
  // A stable random value for this edition: `salt` keeps each parameter independent.
  const rnd = (lo: number, hi: number, salt: number) => expr(`random(${lo}, ${hi}, ${salt})`, (lo + hi) / 2);
  const paper = '#efeeea', black = '#1b1b1f', blue = '#0078bf', pink = '#ff48b0', yellow = '#ffe800';
  const mono = { font: 'Commit Mono' };
  const ink = (id: string, color: string) => ({ id, type: 'color', params: { mode: 'solid', color, target: 'both' } });
  // Where each element sits this edition (shared by the shapes that must line up).
  const blueX = rnd(-380, -90, 1), blueY = rnd(-110, 50, 2);
  const crossX = rnd(260, 470, 7), crossY = rnd(-250, -130, 8);

  const scene = {
    version: 1,
    notes: 'Print Lab. Every 2 s (Document → Seed generator → Every) scene.seedGenerator changes and the sheet is reprinted: positions, rotations, screen angles and sizes are random(min, max, salt) of it, each with its own salt. Inks overprint with multiply blend. Change the seed to browse other runs; set Every to 0 to keep one edition.',
    document: { width: 1280, height: 720 },
    seedEvery: 2,
    objects: [
      {
        kind: 'shape', id: 'title', name: 'Title', shape: 'text',
        params: { ...mono, text: 'PRINT LAB', weight: 700, size: 64, tracking: 40, align: 'left', anchor: 'left', fillColor: black },
        transform: { x: -592, y: 290 }, stack: [],
      },
      {
        kind: 'shape', id: 'edition', name: 'Edition', shape: 'text',
        params: { ...mono, text: 'EDITION {{fixed(floor(scene.time / 2) + 1, 0, 3)}}   RUN {{scene.seedGenerator}}', size: 13, tracking: 200, align: 'right', anchor: 'right', fillColor: black },
        transform: { x: 592, y: 304 }, stack: [],
      },
      // Registration marks: one cross in a corner, mirrored to the other three about the sheet's centre.
      {
        kind: 'shape', id: 'register', name: 'Registration', shape: 'cross',
        params: { size: 22, width: 1.5, fillColor: black },
        transform: { x: -600, y: -320 },
        stack: [
          { id: 'register-x', type: 'mirror', params: { reference: 'sheet', axis: 'horizontal', position: 0.5, original: 'keep' } },
          { id: 'register-y', type: 'mirror', params: { reference: 'sheet', axis: 'vertical', position: 0.5, original: 'keep' } },
        ],
      },
      // Black: a block of crosses clipped by a triangle.
      {
        kind: 'shape', id: 'crosses', name: 'Cross block', shape: 'cross',
        params: { size: 14, width: 3, fillColor: black },
        transform: { x: crossX, y: crossY }, blend: 'multiply',
        stack: [
          { id: 'crosses-grid', type: 'clone', params: { mode: 'grid', columns: 11, rows: 11, spacing: [1.75, 1.75] } },
          { id: 'crosses-clip', type: 'mask', params: { source: 'triangle', mode: 'shape', whole: true } },
        ],
      },
      {
        kind: 'shape', id: 'triangle', name: 'Triangle (mask)', shape: 'polygon', visible: false,
        params: { sides: 3, radius: 150, rotation: rnd(-30, 30, 9), fillColor: black },
        transform: { x: crossX, y: crossY }, stack: [],
      },
      // Black stipple: a halo of marks around the blue disc.
      {
        kind: 'shape', id: 'stipple', name: 'Stipple', shape: 'ellipse',
        params: { width: 440, height: 440, fillColor: black },
        transform: { x: blueX, y: blueY }, blend: 'multiply',
        stack: [{ id: 'stipple-marks', type: 'vectorgrain', params: { edge: 'outside', density: 1400, falloff: 46, curve: 1.6, shape: 'speck', size: 1.4, source: 'replace', seed: expr('scene.seedGenerator', 1) } }],
      },
      // Pink: a crosshatched disc shading a linear gradient.
      {
        kind: 'shape', id: 'pink', name: 'Pink hatch', shape: 'ellipse',
        params: { width: 360, height: 360, fillColor: black },
        transform: { x: rnd(80, 360, 3), y: rnd(-90, 110, 4) }, blend: 'multiply',
        stack: [
          { id: 'pink-tone', type: 'gradient', params: { kind: 'linear', from: '#000000', to: '#ffffff', angle: rnd(0, 360, 5) } },
          { id: 'pink-hatch', type: 'crosshatch', params: { spacing: 7, angle: rnd(20, 70, 6), layers: 3, width: 1.4 } },
          ink('pink-ink', pink),
        ],
      },
      // Blue: a halftone screen on a radial gradient.
      {
        kind: 'shape', id: 'blue', name: 'Blue halftone', shape: 'ellipse',
        params: { width: 440, height: 440, fillColor: black },
        transform: { x: blueX, y: blueY }, blend: 'multiply',
        stack: [
          { id: 'blue-tone', type: 'gradient', params: { kind: 'radial', from: '#000000', to: '#ffffff', center: [0.5, 0.5], focus: [rnd(0.25, 0.75, 10), rnd(0.25, 0.75, 11)], radius: 0.6 } },
          { id: 'blue-screen', type: 'halftone', params: { spacing: rnd(9, 15, 12), angle: rnd(0, 90, 13), shape: 'circle', min: 0, max: 1.05, gamma: 1.2 } },
          ink('blue-ink', blue),
        ],
      },
      // Yellow: an ordered-dither slab.
      {
        kind: 'shape', id: 'yellow', name: 'Yellow dither', shape: 'rectangle',
        params: { width: 560, height: 260, fillColor: black },
        transform: { x: rnd(-160, 160, 14), y: rnd(60, 170, 15), rotation: rnd(-18, 18, 16) }, blend: 'multiply',
        stack: [
          { id: 'yellow-tone', type: 'gradient', params: { kind: 'linear', from: '#000000', to: '#ffffff', angle: rnd(-40, 40, 17) } },
          { id: 'yellow-dither', type: 'dithering', params: { spacing: 7, algorithm: 'bayer', matrix: '4', angle: 0 } },
          ink('yellow-ink', yellow),
        ],
      },
      {
        kind: 'shape', id: 'sheet', name: 'Paper', shape: 'rectangle',
        params: { width: 1280, height: 720, fillColor: paper },
        stack: [{ id: 'paper-grain', type: 'grain', params: { amount: 0.18, size: 1, seed: 4 } }],
      },
    ],
    animation: { duration: 10, loop: false, infinite: true, fps: 30, tracks: [] },
  };
  return { svertik: 'project', version: 1, name: 'svertik print lab', scene: { ...scene, background: paper } };
}

// Plotter: a specimen sheet of the line generators, one per panel and one layer each (Flow Field, Wave
// Lines, String Art, Spirograph, Contour, Weave). A Trim at the end of every stack draws the panel like a
// pen plotter, one panel after another, then lifts it off in the same order. Each panel's draw and lift
// read scene.custom.pace. 12 s loop on a 1280 × 720 document.
export function plotterProject() {
  const expr = (source: string, fallback = 0) => ({ $expr: source, fallback });
  const dim = '#6a6a73', frame = '#1d1d23', accent = '#09fdd1', hot = '#ff2bd6', sun = '#ffd23f', blue = '#4d8dff', ink = '#efefef', stage = '#0b0b0e';
  const mono = { font: 'Commit Mono' };
  const W = 380, H = 300; // panel size
  const at = (i: number) => ({ x: ((i % 3) - 1) * 410, y: i < 3 ? -170 : 170 });
  // Draw from `i * pace`, over 2.4 s; lift from 8.4 s on, in the same order.
  const pen = (i: number, suffix = '') => ({
    id: `pen-${i}${suffix}`, type: 'trim', params: {
      start: expr(`easeInOut((scene.time - 8.4 - ${i} * scene.custom.pace * 0.5) / 1.4)`),
      end: expr(`easeInOut((scene.time - ${i} * scene.custom.pace) / 2.4)`, 1),
      offset: 0,
    },
  });
  const panel = (i: number, id: string, name: string, art: object) => ({
    kind: 'group', id: `layer-${id}`, name, layer: true, stack: [],
    children: [
      { kind: 'shape', id: `${id}-label`, name: `${name} label`, shape: 'text', params: { ...mono, text: `0${i + 1}  ${name.toUpperCase()}`, size: 12, tracking: 260, align: 'left', anchor: 'left', fillColor: dim }, transform: { x: at(i).x - W / 2 + 14, y: at(i).y + H / 2 - 18 }, stack: [] },
      art,
      { kind: 'shape', id: `${id}-frame`, name: `${name} frame`, shape: 'rectangle', params: { width: W, height: H, fill: false, stroke: true, strokeColor: frame, strokeWidth: 1 }, transform: at(i), stack: [] },
    ],
  });
  const source = (id: string, i: number, width: number, height: number, stack: object[], extra: object = {}) => ({
    kind: 'shape', id, name: id, shape: 'ellipse', params: { width, height, fillColor: '#000000', ...extra },
    transform: { x: at(i).x, y: at(i).y - 10 }, stack: [...stack, pen(i)],
  });
  const thread = (axis: 'warp' | 'weft', color: string) => {
    const vertical = axis === 'warp';
    return {
      kind: 'group', id: axis, name: vertical ? 'Warp' : 'Weft',
      stack: [{ id: `${axis}-clone`, type: 'clone', params: { mode: 'grid', columns: vertical ? 7 : 1, rows: vertical ? 1 : 6, spacing: [1, 1] } }],
      children: [
        // The pen draws each thread before Weave interlaces them (a Trim after Weave would undo the crossings).
        { kind: 'shape', id: `${axis}-thread`, name: `${axis} thread`, shape: 'line', params: { length: vertical ? 220 : 280, angle: vertical ? 90 : 0, strokeColor: color, strokeWidth: 6, strokeCap: 'round' }, stack: [pen(5, `-${axis}`)] },
        { kind: 'shape', id: `${axis}-cell`, name: `${axis} cell`, shape: 'rectangle', params: vertical ? { width: 40, height: 220, fill: false } : { width: 280, height: 37, fill: false }, stack: [] },
      ],
    };
  };

  const scene = {
    version: 1,
    notes: 'Plotter. Six line generators, one per layer. Each stack ends in a Trim whose End draws the panel (from index × scene.custom.pace) and whose Start lifts it again from 8.4 s. Select a panel\'s generator to change it: field scale and curl, wave speed, string-art skip, spirograph teeth, contour levels, weave gap.',
    document: { width: 1280, height: 720 },
    custom: { pace: 0.9 },
    objects: [
      panel(0, 'flow', 'Flow field', source('flow-field', 0, 250, 230, [
        { id: 'flow-lines', type: 'flowfield', params: { lines: 70, length: 240, step: 4, scale: 2.6, curl: 1.3, direction: -90, seed: 17 } },
        { id: 'flow-ink', type: 'color', params: { mode: 'palette', palette: [accent, blue, ink], paletteMode: 'random', seed: 5, target: 'stroke' } },
      ])),
      panel(1, 'waves', 'Wave lines', source('wave-lines', 1, 240, 240, [
        { id: 'waves-tone', type: 'gradient', params: { kind: 'radial', from: '#ffffff', to: '#000000', center: [0.45, 0.4], radius: 0.7 } },
        { id: 'waves-lines', type: 'wavelines', params: { spacing: 7, resolution: 4, amplitude: 14, wavelength: 120, width: 1.2, weight: 0.9, time: expr('scene.time'), speed: 0.3 } },
        { id: 'waves-ink', type: 'color', params: { mode: 'solid', color: hot, target: 'both' } },
      ])),
      panel(2, 'strings', 'String art', source('string-art', 2, 236, 236, [
        { id: 'strings-chords', type: 'stringart', params: { points: 120, skip: 47, phase: 0 } },
      ], { fill: false, stroke: true, strokeColor: sun, strokeWidth: 0.8 })),
      panel(3, 'gears', 'Spirograph', source('spirograph', 3, 236, 236, [
        { id: 'gears-curve', type: 'spirograph', params: { mode: 'epi', ring: 60, wheel: 22, pen: 1.4, detail: 1800, phase: 0 } },
      ], { fill: false, stroke: true, strokeColor: blue, strokeWidth: 1 })),
      panel(4, 'isobars', 'Contour', source('contour', 4, 300, 230, [
        { id: 'isobars-tone', type: 'gradient', params: { kind: 'radial', from: '#ffffff', to: '#000000', center: [0.5, 0.5], radius: 0.5 } },
        { id: 'isobars-lines', type: 'contour', params: { spacing: 4, levels: 11, width: 1, gamma: 0.85, merge: true } },
        // Warp the rings into terrain.
        { id: 'isobars-terrain', type: 'noise', params: { amount: 0.09, scale: 2.2, evolution: expr('scene.time * 0.05'), seed: 6 } },
        { id: 'isobars-ink', type: 'color', params: { mode: 'solid', color: ink, target: 'both' } },
      ])),
      panel(5, 'cloth', 'Weave', {
        kind: 'group', id: 'woven', name: 'Woven', transform: { x: at(5).x, y: at(5).y - 10 },
        stack: [{ id: 'woven-weave', type: 'weave', params: { gap: 9, samples: 12 } }],
        children: [thread('warp', accent), thread('weft', hot)],
      }),
    ],
    animation: { duration: 12, loop: true, fps: 30, tracks: [] },
  };
  return { svertik: 'project', version: 1, name: 'svertik plotter', scene: { ...scene, background: stage } };
}

// Cells: a living specimen under the microscope. Inside a Petri dish: drifting Voronoi tissue (Blob cells,
// magnified by a Spherize lens that wanders across it), nuclei that wiggle while a
// Network keeps linking each to its nearest neighbours, and an amoeba of wiggling blobs fused by Metaball
// with a trembling Displace edge. Lab captions and a scale bar around it. Infinite time.
export function cellsProject() {
  const expr = (source: string, fallback = 0) => ({ $expr: source, fallback });
  const dim = '#6a6a73', rim = '#24242b', accent = '#09fdd1', hot = '#ff2bd6', ink = '#efefef', stage = '#0b0b0e';
  const mono = { font: 'Commit Mono' };
  const TISSUE = 700; // the tissue disc's size, for the lens in px
  // The lens wanders in fractions of the tissue box; the ring outlining it reads the same values in px.
  const lensX = 'scene.custom.lensX', lensY = 'scene.custom.lensY';
  const caption = (id: string, text: string, x: number, y: number, align = 'left', color = dim) => ({
    kind: 'shape', id, name: id, shape: 'text', params: { ...mono, text, size: 13, tracking: 260, align, anchor: align, fillColor: color }, transform: { x, y }, stack: [],
  });
  const blob = (n: number, size: number, x: number, y: number) => ({ kind: 'shape', id: `blob-${n}`, name: `Blob ${n}`, shape: 'ellipse', params: { width: size, height: size, fillColor: hot }, transform: { x, y }, stack: [] });

  const scene = {
    version: 1,
    notes: 'Cells. Tissue: a gradient disc through Voronoi (drift bound to scene.time), Blob (rounded cells with an inset that opens the membranes) and a Spherize lens whose centre is the custom lensX / lensY (fractions of the tissue); the Lens ring follows the same variables. Nuclei: Clone inside the Dish, Wiggle per element, Network linking neighbours. Amoeba: blobs with Wiggle per element, fused by Metaball, edges by Displace. Everything is clipped to the Dish (hidden).',
    document: { width: 1280, height: 720 },
    custom: {
      lensX: expr('0.5 + 0.22 * sin(scene.time * 0.31) + 0.08 * sin(scene.time * 0.83)', 0.5),
      lensY: expr('0.5 + 0.2 * sin(scene.time * 0.43 + 1)', 0.5),
    },
    objects: [
      caption('specimen', 'SPECIMEN 07', -600, -320),
      caption('magnification', 'CELLS   ×400', -600, -296, 'left', ink),
      caption('clock', 'T {{fixed(scene.time, 1, 3)}} S', 600, -320, 'right'),
      caption('scale-label', '50 µm', 600, 296, 'right'),
      { kind: 'shape', id: 'scale-bar', name: 'Scale bar', shape: 'line', params: { length: 100, strokeColor: ink, strokeWidth: 2, strokeCap: 'butt' }, transform: { x: 550, y: 316 }, stack: [] },
      {
        kind: 'shape', id: 'lens', name: 'Lens ring', shape: 'ellipse',
        params: { width: TISSUE * 0.36, height: TISSUE * 0.36, fill: false, stroke: true, strokeColor: ink, strokeWidth: 1, dash: 2, gap: 6 },
        transform: { x: expr(`(${lensX} - 0.5) * ${TISSUE}`), y: expr(`(${lensY} - 0.5) * ${TISSUE}`) }, opacity: 0.45, stack: [],
      },
      {
        kind: 'group', id: 'amoeba', name: 'Amoeba',
        transform: { x: expr('150 * sin(scene.time * 0.17)', 0), y: expr('110 * sin(scene.time * 0.23 + 2)', 0) },
        stack: [
          { id: 'amoeba-crawl', type: 'wiggle', params: { time: expr('scene.time'), frequency: 0.35, amplitude: 1, perElement: true, elementPhase: 70, seed: 5 }, children: [
            { id: 'amoeba-crawl-move', type: 'transform', params: { x: 46, y: 40 } },
          ] },
          { id: 'amoeba-fuse', type: 'metaball', params: { reach: 38, grow: 0, quality: 90 } },
          { id: 'amoeba-tone', type: 'gradient', params: { kind: 'radial', from: hot, to: '#5a1250', radius: 0.6 } },
          { id: 'amoeba-edge', type: 'displace', params: { amount: 5, scale: 24, detail: 2, seed: 3 } },
        ],
        children: [blob(1, 70, 0, 0), blob(2, 46, 52, -18), blob(3, 38, -48, 22), blob(4, 30, 20, 50), blob(5, 26, -30, -44)],
        opacity: 0.92,
      },
      {
        kind: 'shape', id: 'nuclei', name: 'Nuclei', shape: 'ellipse',
        params: { width: 9, height: 9, fillColor: accent },
        stack: [
          { id: 'nuclei-place', type: 'clone', params: { mode: 'object', target: 'dish', place: 'inside', count: 30, seed: 4, scaleMin: 0.7, scaleMax: 1.4, variationSeed: 2 } },
          { id: 'nuclei-drift', type: 'wiggle', params: { time: expr('scene.time'), frequency: 0.3, amplitude: 1, perElement: true, elementPhase: 47, seed: 9 }, children: [
            { id: 'nuclei-drift-move', type: 'transform', params: { x: 26, y: 26 } },
          ] },
          { id: 'nuclei-links', type: 'network', params: { neighbors: 2, maxDistance: 150, gap: 6, elasticity: 0.35, resistance: 3, width: 1 } },
          { id: 'nuclei-clip', type: 'mask', params: { source: 'dish', mode: 'shape' } },
          { id: 'nuclei-glow', type: 'glow', params: { size: 6, color: accent, strength: 0.7 } },
        ],
      },
      {
        kind: 'shape', id: 'tissue', name: 'Tissue', shape: 'ellipse',
        params: { width: TISSUE, height: TISSUE, fillColor: '#123c3a' },
        stack: [
          { id: 'tissue-tone', type: 'gradient', params: { kind: 'radial', from: '#1d5c57', via: true, viaColor: '#14303f', to: '#24143a', center: [0.4, 0.35], radius: 0.75 } },
          { id: 'tissue-cells', type: 'voronoi', params: { gap: 0, spacing: 54, jitter: 0.85, seed: 19, drift: 0.3, speed: 0.4, time: expr('scene.time') } },
          // Each cell becomes a blob; the inset opens the dark membranes between them.
          { id: 'tissue-blob', type: 'blob', params: { roundness: 0.9, inset: 2 } },
          { id: 'tissue-lens', type: 'spherize', params: { center: [expr(lensX, 0.5), expr(lensY, 0.5)], radius: 0.18, strength: 0.85 } },
          { id: 'tissue-clip', type: 'mask', params: { source: 'dish', mode: 'shape' } },
        ],
      },
      { kind: 'shape', id: 'rim', name: 'Dish rim', shape: 'ellipse', params: { width: 652, height: 652, fill: false, stroke: true, strokeColor: rim, strokeWidth: 2 }, stack: [] },
      { kind: 'shape', id: 'dish', name: 'Dish', shape: 'ellipse', visible: false, params: { width: 640, height: 640, fillColor: '#000000' }, stack: [] },
    ],
    animation: { duration: 20, loop: false, infinite: true, fps: 30, tracks: [] },
  };
  return { svertik: 'project', version: 1, name: 'svertik cells', scene: { ...scene, background: stage } };
}

// Harbor Fireworks: a particle show over the water that never repeats. Five shells take turns: each rises
// as a rocket with a Trace tail and bursts with the Fireworks particle preset (streaks by Stretch by speed),
// leaving slow glitter behind. Every cycle a shell picks a new spot, seed and colour with random() of its
// own cycle. A Mirror reflects the whole sky below the horizon, where a dark overlay with Scanlines breaks
// the reflection into water. One Glow on the sky. Infinite time.
export function fireworksProject() {
  const expr = (source: string, fallback = 0) => ({ $expr: source, fallback });
  const dim = '#6a6a73', stage = '#0b0b0e';
  const palette = ['#09fdd1', '#ff2bd6', '#ffd23f', '#4d8dff', '#efefef'];
  const mono = { font: 'Commit Mono' };
  // Horizon at the middle: a burst at height h above it reflects h below, so the water must be as deep as the sky.
  const SHELLS = 5, PERIOD = 5, RISE = 0.9, HORIZON = 0;
  const shell = (i: number) => {
    // This shell's clock within its period, and how many periods it has completed (its cycle).
    const local = `mod(scene.time - ${i}, ${PERIOD})`;
    const cycle = `floor((scene.time - ${i}) / ${PERIOD})`;
    const salt = `${cycle} * 17 + ${i}`;
    // Bursts reach about 210 px: keep them inside the sky.
    const x = `random(-380, 380, ${salt})`, y = `random(-220, -140, ${salt} + 500)`;
    const burst = (id: string, params: object, extra: object[] = []) => ({
      kind: 'shape', id, name: id, shape: 'ellipse', params: { width: 6, height: 6, fillColor: '#ffffff' },
      transform: { x: expr(x), y: expr(y) }, opacity: expr(`step(${RISE}, ${local})`),
      stack: [
        { id: `${id}-particles`, type: 'particles', params: { ...params, time: expr(`max(0, ${local} - ${RISE})`), seed: expr(`${salt} * 7 + 1`, 1) } },
        ...extra,
      ],
    });
    const colour = (id: string) => ({ id, type: 'color', params: { mode: 'palette', palette, paletteMode: 'index', index: expr(`mod(${cycle} + ${i} * 2, ${palette.length})`), target: 'both' } });
    return [
      burst(`shell-${i}`, {
        emission: 'burst', count: 110, lifetime: 2.4, lifetimeRandom: 0.3, referenceSize: 400, emitter: 'point',
        direction: -90, spread: 360, speed: 0.95, speedRandom: 0.25, gravity: 0.45, drag: 1.8, rotationRandom: 0, spin: 0,
        alignToMotion: true, stretch: 3, size: 0.012, sizeRandom: 0.3, fade: 0.55, sizeEnd: 0.3,
      }, [colour(`shell-${i}-colour`)]),
      burst(`glitter-${i}`, {
        emission: 'burst', count: 36, lifetime: 3.6, lifetimeRandom: 0.4, referenceSize: 400, emitter: 'circle', area: [0.5, 0.5],
        direction: 90, spread: 360, speed: 0.25, speedRandom: 0.6, gravity: 0.12, drag: 1.2, turbulence: 0.04, turbulenceFrequency: 0.8,
        spin: 0, size: 0.006, sizeRandom: 0.5, fadeIn: 0.3, fade: 0.6, sizeEnd: 0.6,
      }),
      {
        kind: 'shape', id: `rocket-${i}`, name: `Rocket ${i + 1}`, shape: 'ellipse', params: { width: 4, height: 4, fillColor: '#ffffff' },
        transform: { x: expr(x), y: expr(`lerp(${HORIZON}, ${y}, easeOut(${local} / ${RISE}))`, HORIZON) },
        opacity: expr(`1 - step(${RISE}, ${local})`, 1), stack: [],
      },
      {
        kind: 'shape', id: `tail-${i}`, name: `Tail ${i + 1}`, shape: 'line', params: { strokeColor: '#ffd9a0', strokeWidth: 1.5 },
        // Hidden while the trace still remembers last cycle's position, and once the rocket bursts.
        opacity: expr(`smoothstep(0.3, 0.45, ${local}) * (1 - step(${RISE}, ${local}))`),
        stack: [{ id: `tail-${i}-trace`, type: 'trace', params: { target: `rocket-${i}`, length: 0.3, samples: 16, smooth: true } }],
      },
    ];
  };

  const scene = {
    version: 1,
    notes: 'Harbor Fireworks. Five shells, one every second, each on a 5 s period: a rocket rises for 0.9 s (its Tail is a Trace), then two Particles emitters burst at the apex (streaks with Stretch by speed, then slow glitter). Each shell\'s period index (its cycle) seeds random() for the burst position, the particle seed and the palette index, so the show never repeats. Sky: Mirror about the Horizon reference reflects everything under the horizon; the Water overlay (Scanlines) dims and breaks the reflection. Glow on the Sky group.',
    document: { width: 1280, height: 720 },
    objects: [
      { kind: 'shape', id: 'caption', name: 'Caption', shape: 'text', params: { ...mono, text: 'HARBOR FIREWORKS', size: 13, tracking: 300, align: 'left', anchor: 'left', fillColor: dim }, transform: { x: -600, y: -320 }, stack: [] },
      { kind: 'shape', id: 'count', name: 'Shell count', shape: 'text', params: { ...mono, text: 'SHELL {{fixed(floor(scene.time) + 1, 0, 4)}}', size: 13, tracking: 300, align: 'right', anchor: 'right', fillColor: dim }, transform: { x: 600, y: -320 }, stack: [] },
      // Water: dims the reflection and cuts it into ripples.
      {
        kind: 'shape', id: 'water', name: 'Water', shape: 'rectangle', params: { width: 1280, height: 360 - HORIZON, fillColor: stage },
        transform: { y: (HORIZON + 360) / 2 }, opacity: 0.55,
        stack: [{ id: 'water-ripples', type: 'scanlines', params: { count: 26, width: 1.6 } }],
      },
      { kind: 'shape', id: 'horizon', name: 'Horizon line', shape: 'line', params: { length: 1280, strokeColor: '#1d1d23', strokeWidth: 1 }, transform: { y: HORIZON }, stack: [] },
      {
        kind: 'group', id: 'sky', name: 'Sky',
        stack: [
          { id: 'sky-reflection', type: 'mirror', params: { reference: 'sky-frame', axis: 'vertical', position: 1, original: 'keep' } },
          { id: 'sky-glow', type: 'glow', params: { size: 8, color: '#ffffff', strength: 0.6 } },
        ],
        children: Array.from({ length: SHELLS }, (_, i) => shell(i)).flat(),
      },
      // Reference for the Mirror: the sky down to the horizon.
      { kind: 'shape', id: 'sky-frame', name: 'Sky frame', shape: 'rectangle', visible: false, params: { width: 1280, height: 360 + HORIZON, fillColor: stage }, transform: { y: (HORIZON - 360) / 2 }, stack: [] },
    ],
    animation: { duration: 10, loop: false, infinite: true, fps: 30, tracks: [] },
  };
  return { svertik: 'project', version: 1, name: 'svertik harbor fireworks', scene: { ...scene, background: stage } };
}

// Soft Cells: an homage to the rigid-body web experiments of the mid-2000s. Dark, slightly translucent
// cells rain into a white page one after another, pile up and squash against each other into blobs (Soft
// Body in a Physics group with gravity, a floor and two walls as solid targets). Each cell carries a tiny
// white mark (a donut with a pin-hole). The pile fades and the rain starts again. 14 s loop.
export function softCellsProject() {
  const expr = (source: string, fallback = 0) => ({ $expr: source, fallback });
  const paper = '#f4f4f2', ink = '#2b1517', dim = '#8a8584';
  const mono = { font: 'Commit Mono' };
  // A small seeded generator so the layout is stable and needs no stored list.
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const COUNT = 26;
  const cells = Array.from({ length: COUNT }, (_, i) => {
    const r = Math.round(38 + rand() ** 1.6 * 92);
    // Staggered heights above the page: they keep arriving for a few seconds.
    const x = Math.round(-520 + rand() * 1040), y = Math.round(-480 - i * 130 - rand() * 60);
    return {
      kind: 'shape', id: `cell-${i + 1}`, name: `Cell ${i + 1}`, shape: 'donut',
      params: { radius: r, innerRadius: 2.2, fillColor: ink },
      transform: { x, y }, opacity: 0.9,
      stack: [
        { id: `cell-${i + 1}-soft`, type: 'softbody', params: { stiffness: 0.35, bending: 0.05, volume: 0.95, damping: 0.5, recovery: 4, segments: 24 } },
        { id: `cell-${i + 1}-push`, type: 'rigidbody', params: { velocity: [Math.round((rand() - 0.5) * 120), 0], spin: 0 } },
      ],
    };
  });
  const solid = (id: string, x: number, y: number, width: number, height: number) => ({ kind: 'shape', id, name: id, shape: 'rectangle', visible: false, params: { width, height, fillColor: ink }, transform: { x, y }, stack: [] });

  const scene = {
    version: 1,
    notes: 'Soft Cells. The Cells group runs Physics (gravity, collisions) against three hidden solids: Floor, Wall L and Wall R. Each cell is a Donut with a pin-hole (the white mark), a Soft Body material and a Rigid Body with a small sideways push; they start stacked high above the page, so they arrive one after another. The group fades out at the end of the 14 s loop. Change Stiffness and Keep area on a cell\'s Soft Body to make it softer or firmer.',
    document: { width: 1280, height: 720 },
    objects: [
      { kind: 'shape', id: 'caption', name: 'Caption', shape: 'text', params: { ...mono, text: 'SOFT CELLS   GRAVITY / ELASTIC CONTACT', size: 11, tracking: 200, align: 'left', anchor: 'left', fillColor: dim }, transform: { x: -610, y: -330 }, stack: [] },
      { kind: 'shape', id: 'clock', name: 'Clock', shape: 'text', params: { ...mono, text: '{{fixed(scene.time, 2, 2)}}', size: 11, tracking: 200, align: 'right', anchor: 'right', fillColor: dim }, transform: { x: 610, y: -330 }, stack: [] },
      {
        kind: 'group', id: 'cells', name: 'Cells',
        opacity: expr('1 - smoothstep(12.6, 13.8, scene.time)', 1),
        stack: [{ id: 'sim', type: 'physics', params: { time: expr('scene.time'), acceleration: [0, 900], collisions: true, solids: ['floor', 'wall-l', 'wall-r'], friction: 0.3, bounce: 0.2 }, children: [] }],
        children: cells,
      },
      solid('floor', 0, 410, 1600, 100), solid('wall-l', -690, -400, 100, 2000), solid('wall-r', 690, -400, 100, 2000),
    ],
    animation: { duration: 14, loop: true, fps: 30, tracks: [] },
  };
  return { svertik: 'project', version: 1, name: 'svertik soft cells', scene: { ...scene, background: paper } };
}

// Lift & Sink: one Physics world, two pulls. The world's own Acceleration is a gentle lift upwards (helium),
// so the coloured balloons rise and crowd under the ceiling; the dark cells carry their own Gravity, stronger
// and downwards, so they sink and pile on the floor. Everything is soft. Click to drop a cell, right-click to
// release a balloon (each click picks its colour); click a body to push it, double-click to burst it, drag it to throw it. Infinite: the world keeps running.
export function liftSinkProject() {
  const expr = (source: string, fallback = 0) => ({ $expr: source, fallback });
  const paper = '#f4f4f2', ink = '#2b1517', dim = '#8a8584';
  const palette = ['#e8553a', '#f2b134', '#3a7be8', '#2bb39b', '#d94f9b'];
  const mono = { font: 'Commit Mono' };
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Gravity pulls in sizes of the body per s²: this keeps every cell at the same 1100 px/s².
  const PULL = 1100;
  const gravityFor = (r: number) => Math.round((PULL / (2 * r)) * 100) / 100;

  const cell = (id: string, name: string, r: number, x: number, y: number, visible = true) => ({
    kind: 'shape', id, name, shape: 'donut', ...(visible ? {} : { visible: false }),
    params: { radius: r, innerRadius: 2.2, fillColor: ink },
    transform: { x, y }, opacity: 0.92,
    stack: [
      { id: `${id}-soft`, type: 'softbody', params: { stiffness: 0.4, bending: 0.05, volume: 0.95, damping: 0.5, recovery: 4, segments: 22 } },
      // Its own pull, handed to the group's Physics (the floor is the world's: far away here).
      { id: `${id}-gravity`, type: 'gravity', params: { gravity: gravityFor(r), floor: [0.5, 60] } },
    ],
  });
  const balloon = (id: string, name: string, r: number, x: number, y: number, color: string, visible = true, colorStack: object[] = []) => ({
    kind: 'shape', id, name, shape: 'ellipse', ...(visible ? {} : { visible: false }),
    params: { width: r * 2, height: r * 2.15, fillColor: color },
    transform: { x, y },
    stack: [
      ...colorStack,
      { id: `${id}-soft`, type: 'softbody', params: { stiffness: 0.25, bending: 0.05, volume: 0.98, damping: 0.35, recovery: 4, segments: 22 } },
    ],
  });

  // A middle band to start from: cells and balloons mixed, so they cross on the way.
  const starters = Array.from({ length: 12 }, (_, i) => {
    const x = Math.round(-520 + (i % 6) * 208 + (rand() - 0.5) * 60), y = Math.round(-90 + Math.floor(i / 6) * 150 + (rand() - 0.5) * 40);
    const r = Math.round(36 + rand() * 26);
    return i % 2 === 0 ? cell(`cell-${i / 2 + 1}`, `Cell ${i / 2 + 1}`, r, x, y) : balloon(`balloon-${(i + 1) / 2}`, `Balloon ${(i + 1) / 2}`, r, x, y, palette[((i - 1) / 2) % palette.length]!);
  });

  const solid = (id: string, name: string, x: number, y: number, width: number, height: number) => ({ kind: 'shape', id, name, shape: 'rectangle', visible: false, params: { width, height, fillColor: ink }, transform: { x, y }, stack: [] });

  const scene = {
    version: 1,
    notes: 'Lift & Sink. The World group runs one Physics simulation whose Acceleration is a gentle lift upwards (-260 px/s²), against four hidden solids (Floor, Ceiling, Wall L, Wall R). Balloons only feel that lift and rise; each Cell also carries its own Gravity, which inside a Physics group hands its pull to that Physics instead of simulating apart, so cells sink (1100 px/s² down, minus the lift). Everything is Soft Body. Play: click on empty space drops a cell (Drop Cell, a Mouse Instance of the hidden Cell Seed); click on a body pushes it away from the click (Physics Click push, 650 px/s), without dropping one; double-click a body to burst it into 6 pieces (Double-click burst); drag a body and let go to throw it (Drag & throw); right-click releases a balloon (Release Balloon, of Balloon Seed, a palette colour per click); copies join the running world where you click. Up to 24 of each: the oldest is removed. Infinite time.',
    document: { width: 1280, height: 720 },
    objects: [
      { kind: 'shape', id: 'caption', name: 'Caption', shape: 'text', params: { ...mono, text: 'LIFT & SINK   ONE WORLD, TWO PULLS', size: 11, tracking: 200, align: 'left', anchor: 'left', fillColor: dim }, transform: { x: -610, y: -330 }, stack: [] },
      { kind: 'shape', id: 'clock', name: 'Clock', shape: 'text', params: { ...mono, text: '{{fixed(scene.time, 2, 2)}}', size: 11, tracking: 200, align: 'right', anchor: 'right', fillColor: dim }, transform: { x: 610, y: -330 }, stack: [] },
      { kind: 'shape', id: 'hint', name: 'Hint', shape: 'text', params: { ...mono, text: 'CLICK  DROP / PUSH    DOUBLE-CLICK/TAP  BURST    DRAG  THROW    RIGHT-CLICK  BALLOON', size: 11, tracking: 200, align: 'left', anchor: 'left', fillColor: dim }, transform: { x: -610, y: 335 }, stack: [] },
      { kind: 'shape', id: 'count', name: 'Count', shape: 'text', params: { ...mono, text: 'CLICKS {{scene.mouse.clicks}}', size: 11, tracking: 200, align: 'right', anchor: 'right', fillColor: dim }, transform: { x: 610, y: 335 }, stack: [] },
      {
        kind: 'group', id: 'world', name: 'World',
        stack: [{ id: 'sim', type: 'physics', params: { time: expr('scene.time'), acceleration: [0, -260], collisions: true, solids: ['floor', 'ceiling', 'wall-l', 'wall-r'], friction: 0.35, bounce: 0.25, poke: 650, burst: 6, burstSpeed: 320, drag: true }, children: [] }],
        children: [
          { kind: 'instance', id: 'drop', name: 'Drop Cell', of: 'cell-seed', stack: [], mouse: { event: 'click', rate: 8, lifetime: 0, limit: 24, rotationVariation: 180 } },
          { kind: 'instance', id: 'release', name: 'Release Balloon', of: 'balloon-seed', stack: [], mouse: { event: 'right-click', rate: 8, lifetime: 0, limit: 24, scaleVariation: 0.25 } },
          cell('cell-seed', 'Cell Seed', 44, 0, 0, false),
          balloon('balloon-seed', 'Balloon Seed', 40, 0, 0, palette[0]!, false, [
            { id: 'balloon-seed-color', type: 'color', params: { mode: 'palette', palette, paletteMode: 'random', seed: 1, target: 'fill' } },
          ]),
          ...starters,
        ],
      },
      solid('floor', 'Floor', 0, 360, 1600, 100), solid('ceiling', 'Ceiling', 0, -360, 1600, 100),
      solid('wall-l', 'Wall L', -690, 0, 100, 1000), solid('wall-r', 'Wall R', 690, 0, 100, 1000),
    ],
    animation: { duration: 10, infinite: true, loop: false, fps: 30, tracks: [] },
  };
  return { svertik: 'project', version: 1, name: 'svertik lift & sink', scene: { ...scene, background: paper } };
}

// Fridge Magnets: chunky letter magnets on a fridge door, seen straight on, so nothing falls. Each letter is
// a rigid body (Text gives one piece per glyph) in one Physics world with Air drag, so a thrown letter slides,
// knocks the others and stops. Drag a letter and let go to throw it, click to nudge it, double-click to break
// it; click the empty door to stick a new star magnet (a palette colour per click). Infinite.
export function fridgeMagnetsProject() {
  const expr = (source: string, fallback = 0) => ({ $expr: source, fallback });
  const door = '#eeece6', trim = '#d9d5cc', dim = '#9a958c';
  const palette = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#e9c46a', '#8e5bbf'];
  const mono = { font: 'Commit Mono' };
  const magnets = { font: 'Fredoka', weight: 700 };

  const word = (id: string, name: string, text: string, size: number, x: number, y: number, rotation: number, seed: number) => ({
    kind: 'shape', id, name, shape: 'text',
    params: { ...magnets, text, size, tracking: 40, fillColor: palette[0] },
    transform: { x, y, rotation },
    stack: [{ id: `${id}-colors`, type: 'color', params: { mode: 'palette', palette, paletteMode: 'random', seed, target: 'fill' } }],
  });
  const solid = (id: string, name: string, x: number, y: number, width: number, height: number) => ({ kind: 'shape', id, name, shape: 'rectangle', visible: false, params: { width, height, fillColor: trim }, transform: { x, y }, stack: [] });

  const scene = {
    version: 1,
    notes: 'Fridge Magnets. The Magnets group runs one Physics world with no gravity (the door is seen straight on) and Air drag 2.4/s, so thrown letters slide, collide and stop; four hidden solids frame the door and the Handle is a solid too. Each word is a Text shape: every glyph is its own rigid body (holes kept: a small letter can sit inside an O), coloured by a Color palette per letter. A Shadow on the group lifts the magnets off the door. Play: drag a letter and let go to throw it (Drag & throw), click to nudge it (Click push), double-click to break it into 4 pieces (Double-click burst); click the empty door to stick a new star magnet (Stick Star, a Mouse Instance of the hidden Star Seed, a palette colour per click). Infinite time.',
    document: { width: 1280, height: 720 },
    objects: [
      { kind: 'shape', id: 'caption', name: 'Caption', shape: 'text', params: { ...mono, text: 'FRIDGE MAGNETS   DRAG, THROW, KNOCK', size: 11, tracking: 200, align: 'left', anchor: 'left', fillColor: dim }, transform: { x: -610, y: -330 }, stack: [] },
      { kind: 'shape', id: 'hint', name: 'Hint', shape: 'text', params: { ...mono, text: 'DRAG  THROW    CLICK  PUSH / NEW STAR    DOUBLE-CLICK/TAP  BREAK', size: 11, tracking: 200, align: 'left', anchor: 'left', fillColor: dim }, transform: { x: -610, y: 335 }, stack: [] },
      { kind: 'shape', id: 'count', name: 'Count', shape: 'text', params: { ...mono, text: 'CLICKS {{scene.mouse.clicks}}', size: 11, tracking: 200, align: 'right', anchor: 'right', fillColor: dim }, transform: { x: 610, y: 335 }, stack: [] },
      {
        kind: 'group', id: 'magnets', name: 'Magnets',
        stack: [
          { id: 'sim', type: 'physics', params: { time: expr('scene.time'), acceleration: [0, 0], damping: 2.4, collisions: true, solids: ['top', 'bottom', 'left', 'right', 'handle'], friction: 0.3, bounce: 0.45, poke: 520, burst: 4, burstSpeed: 240, drag: true }, children: [] },
          { id: 'lift', type: 'shadow', params: { offset: [3, 6], blur: 5, color: '#5b4f3f', opacity: 0.35 } },
        ],
        children: [
          { kind: 'instance', id: 'stick', name: 'Stick Star', of: 'star-seed', stack: [], mouse: { event: 'click', rate: 6, lifetime: 0, limit: 30, rotationVariation: 36, scaleVariation: 0.3 } },
          { kind: 'shape', id: 'star-seed', name: 'Star Seed', shape: 'star', visible: false, params: { points: 5, radius: 42, inner: 0.48, fillColor: palette[1] }, stack: [
            { id: 'star-seed-color', type: 'color', params: { mode: 'palette', palette, paletteMode: 'random', seed: 3, target: 'fill' } },
          ] },
          word('hello', 'Hello', 'HELLO', 170, -170, -150, -4, 11),
          word('svertik', 'Svertik', 'SVERTIK', 150, -60, 60, 3, 23),
          word('abc', 'ABC', 'ABC', 90, -420, 235, -8, 37),
          word('digits', '123', '123', 90, 300, 240, 6, 41),
        ],
      },
      // The door: its frame, a seam near the top and the handle (a solid the magnets knock against).
      { kind: 'shape', id: 'handle', name: 'Handle', shape: 'rectangle', params: { width: 34, height: 300, radius: 17, fillColor: trim }, transform: { x: 575, y: -20 }, stack: [] },
      { kind: 'shape', id: 'seam', name: 'Seam', shape: 'rectangle', params: { width: 1280, height: 3, fillColor: trim }, transform: { x: 0, y: -292 }, stack: [] },
      solid('top', 'Top', 0, -343, 1500, 100), solid('bottom', 'Bottom', 0, 410, 1500, 100),
      solid('left', 'Left', -690, 0, 100, 1000), solid('right', 'Right', 690, 0, 100, 1000),
    ],
    animation: { duration: 10, infinite: true, loop: false, fps: 30, tracks: [] },
  };
  return { svertik: 'project', version: 1, name: 'svertik fridge magnets', scene: { ...scene, background: door } };
}

// Wires: 48 cables hanging between two poles, at Rope's full resolution (120 segments each: about 5,800
// particles stepped every frame). Gusts of wind sway them; the pointer is a round obstacle (scene.mouse
// formulas) that parts them as it moves through, and they swing back. Infinite.
export function wiresProject() {
  const expr = (source: string, fallback = 0) => ({ $expr: source, fallback });
  const night = '#0d1117', pole = '#2a313c', dim = '#6b7585';
  const mono = { font: 'Commit Mono' };
  let seed = 5;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const COUNT = 48, LEFT = -560, RIGHT = 560;
  // Each cable: from the left pole to the right one, at slightly different heights, drawn with slack (a
  // lower middle point) so it is longer than the span and hangs.
  const corner = (point: [number, number]) => ({ point, in: [0, 0], out: [0, 0], mode: 'corner' });
  const cables = Array.from({ length: COUNT }, (_, i) => {
    const y0 = -240 + i * 6 + (rand() - 0.5) * 6, y1 = y0 + (rand() - 0.5) * 40;
    const sag = 30 + rand() * 80;
    return { closed: false, points: [corner([LEFT, y0]), corner([0, (y0 + y1) / 2 + sag]), corner([RIGHT, y1])] };
  });
  const scene = {
    version: 1,
    notes: 'Wires. One Path shape with 48 open contours: Rope hangs each one between the poles at full resolution (Segments 120, about 5,800 particles), so it is a stress test of the rope solver. Wind gusts follow a noise formula of scene.time; the Pointer is bound to scene.mouse (Pointer in: Scene) with a Radius that is 0 while the pointer is outside, so moving through the wires parts them. Raise Segments or add cables to load it more; lower them if it drops frames. Infinite time.',
    document: { width: 1280, height: 720 },
    objects: [
      { kind: 'shape', id: 'caption', name: 'Caption', shape: 'text', params: { ...mono, text: 'WIRES   48 ROPES / 120 SEGMENTS', size: 11, tracking: 200, align: 'left', anchor: 'left', fillColor: dim }, transform: { x: -610, y: -330 }, stack: [] },
      { kind: 'shape', id: 'hint', name: 'Hint', shape: 'text', params: { ...mono, text: 'MOVE THROUGH THE WIRES', size: 11, tracking: 200, align: 'left', anchor: 'left', fillColor: dim }, transform: { x: -610, y: 335 }, stack: [] },
      { kind: 'shape', id: 'clock', name: 'Clock', shape: 'text', params: { ...mono, text: '{{fixed(scene.time, 2, 2)}}', size: 11, tracking: 200, align: 'right', anchor: 'right', fillColor: dim }, transform: { x: 610, y: -330 }, stack: [] },
      {
        kind: 'shape', id: 'cables', name: 'Cables', shape: 'path',
        params: { contours: cables, fill: false, stroke: true, strokeColor: '#9fb4c8', strokeWidth: 1.4, strokeCap: 'round' },
        stack: [
          { id: 'hang', type: 'rope', params: {
            gravity: 1.2, wind: expr('0.35 + 0.9 * max(0, noise(scene.time * 0.35, 3))', 0.5), damping: 1.1, stiffness: 18, segments: 120,
            pointer: [expr('scene.mouse.posX'), expr('scene.mouse.posY')], space: 'scene', radius: expr('0.055 * scene.mouse.inside'), settle: 1, seed: 4,
          } },
        ],
      },
      { kind: 'shape', id: 'pole-l', name: 'Pole L', shape: 'rectangle', params: { width: 14, height: 560, radius: 3, fillColor: pole }, transform: { x: LEFT - 7, y: -10 }, stack: [] },
      { kind: 'shape', id: 'pole-r', name: 'Pole R', shape: 'rectangle', params: { width: 14, height: 560, radius: 3, fillColor: pole }, transform: { x: RIGHT + 7, y: -10 }, stack: [] },
    ],
    animation: { duration: 10, infinite: true, loop: false, fps: 30, tracks: [] },
  };
  return { svertik: 'project', version: 1, name: 'svertik wires', scene: { ...scene, background: night } };
}
