import { rng } from './random';
import { CLOCK_FIELDS, customNumber, neutralPointer, neutralRuntime, POINTER_FIELDS, sceneDuration, type SceneRuntime, type ScenePointer } from './scene';
import type { SceneNode, SceneV1 } from './document';

/** Numeric parameter stored as a formula, with its last plain value as a safe fallback. */
export interface NumericExpression {
  $expr: string;
  fallback: number;
}

export interface ExpressionContext {
  time: number;
  frame: number;
  fps: number;
  duration: number;
  progress: number;
  seedGenerator: number;
  /** Host-provided implicit random salt (Mouse Instance birth index); explicit random seeds override it. */
  randomSalt?: number;
  custom: Record<string, number>;
  /** The live pointer (`scene.mouse.*`); the neutral one when absent. */
  mouse?: Partial<ScenePointer>;
  /** The document's size (`scene.width`, `scene.height`); 0 when the scene has no fixed document. */
  width?: number;
  height?: number;
  /** Frame time, page scroll, screen density and the real clock (`scene.dt`, `scene.scroll`, …); neutral when absent. */
  runtime?: Partial<SceneRuntime>;
}

export interface SceneExpressionValues extends ExpressionContext {
  /** Zero-based duration cycle; it keeps increasing when the scene has Infinite enabled. */
  cycle: number;
}

type Expr =
  | { kind: 'number'; value: number }
  | { kind: 'variable'; name: string }
  | { kind: 'unary'; op: '+' | '-'; value: Expr }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '%' | '^' | '**'; left: Expr; right: Expr }
  | { kind: 'call'; name: string; args: Expr[] };

const FUNCTIONS: Record<string, (args: number[]) => number> = {
  abs: ([x]) => Math.abs(x!),
  atan: ([x]) => Math.atan(x!),
  atan2: ([y, x]) => Math.atan2(y!, x!),
  // Radians → degrees: angle parameters are in degrees, trig functions in radians.
  deg: ([x]) => (x! * 180) / Math.PI,
  ceil: ([x]) => Math.ceil(x!),
  clamp: ([x, lo, hi]) => Math.min(hi!, Math.max(lo!, x!)),
  cos: ([x]) => Math.cos(x!),
  floor: ([x]) => Math.floor(x!),
  lerp: ([a, b, t]) => a! + (b! - a!) * t!,
  max: (xs) => Math.max(...xs),
  min: (xs) => Math.min(...xs),
  pow: ([a, b]) => Math.pow(a!, b!),
  round: ([x]) => Math.round(x!),
  sin: ([x]) => Math.sin(x!),
  sqrt: ([x]) => Math.sqrt(x!),
  tan: ([x]) => Math.tan(x!),
};
const ARITY: Record<string, [number, number]> = {
  abs: [1, 1], atan: [1, 1], atan2: [2, 2], deg: [1, 1], ceil: [1, 1], clamp: [3, 3], cos: [1, 1], floor: [1, 1], lerp: [3, 3], 'scene.countDown': [1, 1],
  random: [2, 3], max: [1, Infinity], min: [1, Infinity], pow: [2, 2], round: [1, 1], sin: [1, 1], sqrt: [1, 1], tan: [1, 1],
};
const SCENE_VARIABLES = {
  cycle: 'scene.cycle', time: 'scene.time', frame: 'scene.frame', fps: 'scene.fps', duration: 'scene.duration', progress: 'scene.progress', seedGenerator: 'scene.seedGenerator', width: 'scene.width', height: 'scene.height',
  aspect: 'scene.aspect', dt: 'scene.dt', scroll: 'scene.scroll', pixelRatio: 'scene.pixelRatio',
} as const;
const parsed = new Map<string, Expr>();

function parse(source: string): Expr {
  if (source.length > 512) throw new Error('Expression is too long (maximum 512 characters).');
  const tokens = source.match(/\s*(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|\*\*|[()+\-*/%^.,])/gy);
  if (!tokens) throw new Error('Enter an expression.');
  const list = tokens.map((t) => t.trim()).filter(Boolean);
  const consumed = tokens.join('').length;
  if (source.slice(consumed).trim()) throw new Error(`Unexpected input near “${source.slice(consumed).trim()}”.`);
  let i = 0;
  if (tokens.length > 256) throw new Error('Expression is too complex (maximum 256 tokens).');
  const peek = () => list[i];
  const take = () => list[i++];
  const expect = (token: string) => { if (take() !== token) throw new Error(`Expected “${token}”.`); };
  function call(name: string): Expr {
    expect('(');
    const args: Expr[] = [];
    if (peek() !== ')') {
      do { args.push(additive()); if (peek() !== ',') break; take(); } while (true);
    }
    expect(')');
    const arity = ARITY[name];
    if (!arity) throw new Error(`Unknown function “${name}”.`);
    if (args.length < arity[0] || args.length > arity[1]) throw new Error(`${name}() expects ${arity[0] === arity[1] ? arity[0] : `at least ${arity[0]}`} argument${arity[0] === 1 && arity[1] === 1 ? '' : 's'}.`);
    return { kind: 'call', name, args };
  }

  function primary(): Expr {
    const token = take();
    if (!token) throw new Error('Expected a number, variable, or function.');
    if (/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token)) return { kind: 'number', value: Number(token) };
    if (token === '(') { const e = additive(); expect(')'); return e; }
    if (/^[A-Za-z_]/.test(token)) {
      if (token === 'scene') {
        expect('.');
        const field = take();
        if (field === 'countDown') return call('scene.countDown');
        if (field === 'custom') {
          expect('.');
          const key = take();
          if (!key || !/^[A-Za-z_][A-Za-z_0-9]*$/.test(key)) throw new Error('Use a valid custom variable name after scene.custom.');
          return { kind: 'variable', name: `scene.custom.${key}` };
        }
        if (field === 'clock') {
          expect('.');
          const key = take();
          if (!key || !(CLOCK_FIELDS as readonly string[]).includes(key)) throw new Error(`Use a clock field after scene.clock.: ${CLOCK_FIELDS.join(', ')}.`);
          return { kind: 'variable', name: `scene.clock.${key}` };
        }
        if (field === 'mouse') {
          expect('.');
          const key = take();
          if (!key || !(POINTER_FIELDS as readonly string[]).includes(key)) throw new Error(`Use a pointer field after scene.mouse.: ${POINTER_FIELDS.join(', ')}.`);
          return { kind: 'variable', name: `scene.mouse.${key}` };
        }
        if (!(field && field in SCENE_VARIABLES)) throw new Error('Use a supported scene variable: time, cycle, frame, fps, duration, progress, seedGenerator, width, height, aspect, dt, scroll, pixelRatio, clock.hour, mouse.posX, or custom.name.');
        return { kind: 'variable', name: SCENE_VARIABLES[field as keyof typeof SCENE_VARIABLES] };
      }
      if (token === 'pi' || token === 'e') return { kind: 'variable', name: token };
      if (peek() !== '(') throw new Error(`Unknown name “${token}”.`);
      return call(token);
    }
    throw new Error(`Unexpected token “${token}”.`);
  }
  function power(): Expr {
    const left = primary();
    const op = peek();
    if (op === '^' || op === '**') { take(); return { kind: 'binary', op, left, right: unary() }; }
    return left;
  }
  function unary(): Expr {
    const op = peek();
    if (op === '+' || op === '-') { take(); return { kind: 'unary', op, value: unary() }; }
    return power();
  }
  // Signs bind tighter than * and /, looser than ^ (so -2 ^ 2 is -4, and 3 * -x works).
  function multiply(): Expr {
    let left = unary();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = take() as '*' | '/' | '%';
      left = { kind: 'binary', op, left, right: unary() };
    }
    return left;
  }
  function additive(): Expr {
    let left = multiply();
    while (peek() === '+' || peek() === '-') {
      const op = take() as '+' | '-';
      left = { kind: 'binary', op, left, right: multiply() };
    }
    return left;
  }

  if (!list.length) throw new Error('Enter an expression.');
  const tree = additive();
  if (i !== list.length) throw new Error(`Unexpected token “${list[i]}”.`);
  return tree;
}

function treeOf(source: string): Expr {
  const cached = parsed.get(source);
  if (cached) return cached;
  const tree = parse(source);
  if (parsed.size > 500) parsed.clear();
  parsed.set(source, tree);
  return tree;
}

function run(tree: Expr, context: ExpressionContext): number {
  if (tree.kind === 'number') return tree.value;
  if (tree.kind === 'variable') {
    if (tree.name.startsWith('scene.custom.')) {
      const key = tree.name.slice('scene.custom.'.length);
      if (!Object.hasOwn(context.custom, key)) throw new Error(`Unknown custom variable “${key}”.`);
      return context.custom[key]!;
    }
    if (tree.name.startsWith('scene.mouse.')) {
      const key = tree.name.slice('scene.mouse.'.length) as keyof ScenePointer;
      const value = context.mouse?.[key];
      return Number.isFinite(value) ? value! : neutralPointer({})[key];
    }
    if (tree.name === 'scene.aspect') return context.height && context.width ? context.width / context.height : 0;
    if (tree.name === 'scene.dt' || tree.name === 'scene.scroll' || tree.name === 'scene.pixelRatio' || tree.name.startsWith('scene.clock.')) {
      const key = (tree.name.startsWith('scene.clock.') ? tree.name.slice('scene.clock.'.length) : tree.name.slice('scene.'.length)) as keyof SceneRuntime;
      const value = context.runtime?.[key];
      return Number.isFinite(value) ? value! : neutralRuntime({})[key];
    }
    if (tree.name === 'scene.width' || tree.name === 'scene.height') {
      const size = context[tree.name === 'scene.width' ? 'width' : 'height'];
      return Number.isFinite(size) ? size! : 0;
    }
    if (tree.name === 'scene.cycle') return context.duration > 0 ? Math.max(0, Math.floor(context.time / context.duration)) : 0;
    if (tree.name.startsWith('scene.')) return context[tree.name.slice(6) as keyof Omit<ExpressionContext, 'custom' | 'randomSalt' | 'mouse' | 'runtime'>] as number;
    return tree.name === 'pi' ? Math.PI : Math.E;
  }
  if (tree.kind === 'unary') return tree.op === '-' ? -run(tree.value, context) : run(tree.value, context);
  if (tree.kind === 'binary') {
    const a = run(tree.left, context), b = run(tree.right, context);
    switch (tree.op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return a / b;
      case '%': return a % b;
      default: return a ** b;
    }
  }
  const args = tree.args.map((arg) => run(arg, context));
  if (tree.name === 'random') {
    if (!args.every(Number.isFinite) || !Number.isFinite(context.seedGenerator)) throw new Error('random() expects finite bounds and seed.');
    // Hash both seeds rather than adding them: (base 1, salt 2) differs from (base 2, salt 1).
    // String hashing also preserves fractional/negative salts instead of truncating to uint32.
    let seed = 2166136261;
    const key = `${context.seedGenerator}:${args[2] ?? context.randomSalt ?? 0}`;
    for (let i = 0; i < key.length; i++) seed = Math.imul(seed ^ key.charCodeAt(i), 16777619);
    const low = Math.min(args[0]!, args[1]!), high = Math.max(args[0]!, args[1]!);
    const unit = rng(seed)();
    return low * (1 - unit) + high * unit;
  }
  if (tree.name === 'scene.countDown') return Math.max(0, Math.ceil(args[0]! - context.time));
  return FUNCTIONS[tree.name]!(args);
}

export function validateExpression(source: string): string | null {
  try { treeOf(source); return null; }
  catch (e) { return e instanceof Error ? e.message : String(e); }
}

export function evaluateExpression(source: string, context: ExpressionContext): number {
  const value = run(treeOf(source), context);
  if (!Number.isFinite(value)) throw new Error('Expression must return a finite number.');
  return value;
}

/** Text-only formatter: fixed(value, decimals[, integerDigits]). */
export function evaluateTextExpression(source: string, context: ExpressionContext): string {
  const fixed = source.trim().match(/^fixed\((.*),\s*(\d+)(?:\s*,\s*(\d+))?\)$/);
  if (!fixed) {
    const value = evaluateExpression(source, context);
    return String(Math.round(value * 1e6) / 1e6);
  }
  const decimals = Number(fixed[2]);
  const integerDigits = fixed[3] === undefined ? 0 : Number(fixed[3]);
  if (decimals > 10 || integerDigits > 12) throw new Error('fixed() supports up to 10 decimal places and 12 integer digits.');
  const value = evaluateExpression(fixed[1]!, context);
  const formatted = value.toFixed(decimals);
  if (!integerDigits) return formatted;
  const [integer = '', fraction] = formatted.split('.');
  const sign = integer.startsWith('-') ? '-' : '';
  const digits = sign ? integer.slice(1) : integer;
  const whole = sign + digits.padStart(integerDigits, '0');
  return fraction === undefined ? whole : `${whole}.${fraction}`;
}

export function isNumericExpression(value: unknown): value is NumericExpression {
  return !!value && typeof value === 'object' && typeof (value as NumericExpression).$expr === 'string' && typeof (value as NumericExpression).fallback === 'number';
}

export function hasTextExpressions(value: unknown): value is string {
  return typeof value === 'string' && /\{\{\s*[^{}]+?\s*\}\}/.test(value);
}

/** True when a scene contains a formula (used to treat it as time-driven animation). */
export function sceneHasExpressions(scene: SceneV1): boolean {
  const has = (params?: Record<string, unknown>, points = false) => Object.values(params ?? {}).some(v => isNumericExpression(v) || (points && Array.isArray(v) && v.some(isNumericExpression)));
  const stackHas = (stack?: SceneNode['stack']): boolean => (stack ?? []).some((m) => has(m.params, true) || stackHas(m.children));
  const nodeHas = (node: SceneNode): boolean =>
    (node.kind === 'instance' && has(node.mouse, true)) || (node.kind === 'group' && !!node.composition) || (node.kind === 'shape' && (has(node.params, true) || (node.shape === 'text' && hasTextExpressions(node.params.text)))) || stackHas(node.stack) || !!node.children?.some(nodeHas);
  // A re-seeding generator changes the drawing over time too.
  return (Number(scene.seedEvery) > 0) || Object.values(scene.custom ?? {}).some(isNumericExpression) || scene.objects.some(nodeHas);
}

/**
 * The seed expressions see at `time`: the document's Seed Generator, moved on one step per `seedEvery`
 * seconds when that is set. Steps are far apart (a large prime), so seeds offset from it by small numbers
 * (`scene.seedGenerator + 10`) never land on another interval's values.
 */
export function liveSeed(scene: Pick<SceneV1, 'seedGenerator' | 'seedEvery'>, time = 0): number {
  const base = Math.max(0, Math.round(Number.isFinite(Number(scene.seedGenerator)) ? Number(scene.seedGenerator) : 1));
  const every = Number(scene.seedEvery);
  if (!(every > 0) || !Number.isFinite(time)) return base;
  const tick = Math.max(0, Math.floor(time / every + 1e-9));
  return (base + tick * 7919) % 2147483647;
}

/**
 * Every variable `scene.*` formulas can read, by name (`time`, `width`, `mouse.posX`…), in the order a debug panel
 * shows them. It walks the same tables the parser uses, so a new variable cannot be left out. `pointer`, when
 * given, replaces the pointer in `values` (the player's live one).
 */
export function describeSceneVariables(values: SceneExpressionValues, pointer?: Partial<ScenePointer>, runtime?: Partial<SceneRuntime>): Record<string, number> {
  const ctx: ExpressionContext = { ...values, mouse: { ...values.mouse, ...pointer }, runtime: { ...values.runtime, ...runtime } };
  const out: Record<string, number> = {};
  // Each value is read exactly the way a formula reads it (run), so the list cannot drift from the parser.
  const read = (name: string): number => { const v = run({ kind: 'variable', name }, ctx); return Number.isFinite(v) ? v : 0; };
  for (const key of Object.keys(SCENE_VARIABLES)) out[key] = read(SCENE_VARIABLES[key as keyof typeof SCENE_VARIABLES]);
  for (const key of CLOCK_FIELDS) out[`clock.${key}`] = read(`scene.clock.${key}`);
  for (const key of POINTER_FIELDS) out[`mouse.${key}`] = read(`scene.mouse.${key}`);
  return out;
}

/** Resolve the live values exposed to expressions, without evaluating every object parameter. */
export function evaluateSceneVariables(scene: SceneV1, time = scene.at ?? 0, randomSalt = 0): SceneExpressionValues {
  const fps = scene.animation?.fps ?? 30;
  const duration = sceneDuration(scene);
  const context: SceneExpressionValues = {
    time,
    randomSalt,
    frame: Math.floor(time * fps + 1e-9),
    fps,
    duration,
    progress: duration > 0 ? Math.max(0, Math.min(1, time / duration)) : 0,
    cycle: duration > 0 ? Math.max(0, Math.floor(time / duration)) : 0,
    seedGenerator: liveSeed(scene, time),
    width: scene.document?.width ?? 0,
    height: scene.document?.height ?? 0,
    mouse: { ...neutralPointer(scene), ...scene.pointer },
    runtime: { ...neutralRuntime(scene), ...scene.runtime },
    custom: Object.fromEntries(Object.entries(scene.custom ?? {}).flatMap(([key, value]) => {
      const n = customNumber(value);
      return n === null ? [] : [[key, n]];
    })),
  };
  const pending = new Map(Object.entries(scene.custom ?? {}).filter((entry): entry is [string, NumericExpression] => isNumericExpression(entry[1])));
  while (pending.size) {
    let resolved = false;
    for (const [key, formula] of pending) {
      try {
        context.custom[key] = evaluateExpression(formula.$expr, context);
        pending.delete(key);
        resolved = true;
      } catch {
        // A dependency may be declared after this variable; retry once it is resolved.
      }
    }
    if (!resolved) break;
  }
  for (const [key, formula] of pending) context.custom[key] = formula.fallback;
  return context;
}

/** Evaluate scene formulas on a clone so a changing playhead never overwrites the saved expression. */
export function evaluateSceneExpressions(scene: SceneV1, options: { randomSalt?: number } = {}): SceneV1 {
  if (!sceneHasExpressions(scene)) return scene;
  const out = structuredClone(scene) as SceneV1;
  const time = out.at ?? 0;
  const fps = out.animation?.fps ?? 30;
  const duration = sceneDuration(out);
  const context: ExpressionContext = { ...evaluateSceneVariables(out, time, options.randomSalt ?? 0), randomSalt: options.randomSalt ?? 0 };
  const params = (values?: Record<string, unknown>, points = false) => {
    if (!values) return;
    const one = (value: NumericExpression) => {
      try { return evaluateExpression(value.$expr, context); }
      catch { return value.fallback; }
    };
    for (const [key, value] of Object.entries(values)) {
      if (isNumericExpression(value)) values[key] = one(value);
      else if (points && Array.isArray(value)) values[key] = value.map(v => isNumericExpression(v) ? one(v) : v);
    }
  };
  const stack = (items: SceneNode['stack']) => {
    // Effect and shape params may hold a formula per point component ([{ $expr }, 1]), like Mouse Instance's.
    for (const item of items) { params(item.params, true); stack(item.children ?? []); }
  };
  const nodes = (items: SceneNode[]) => {
    for (const node of items) {
      if (node.kind === 'shape') {
        params(node.params, true);
        if (node.shape === 'text' && hasTextExpressions(node.params.text)) {
          // Dynamic values such as clocks can change the string width as digits are added. Pin the
          // evaluated copy to its typographic left edge so the readout grows to the right without
          // shifting its existing characters. Explicit left/center/right anchors remain respected.
          if (node.params.anchor === undefined || node.params.anchor === 'ink') node.params.anchor = 'left';
          const rate = Math.max(1, Math.min(60, Math.round(Number(node.params.updateRate) || 12)));
          // Runtime marker: the document evaluator pins the default transform pivot to this text anchor.
          node.params.updateRate = rate;
          const time = Math.floor(context.time * rate + 1e-9) / rate;
          const textContext: ExpressionContext = {
            ...context,
            time,
            frame: Math.floor(time * fps + 1e-9),
            progress: duration > 0 ? Math.max(0, Math.min(1, time / duration)) : 0,
          };
          node.params.text = node.params.text.replace(/\{\{([\s\S]*?)\}\}/g, (whole, source: string) => {
            try {
              return evaluateTextExpression(source.trim(), textContext);
            } catch { return whole; }
          });
        }
      }
      if (node.kind === 'instance' && node.mouse) params(node.mouse, true);
      if (node.kind === 'group' && node.composition) { params(node.composition.params); params(node.composition.modulation?.params); }
      stack(node.stack);
      if (node.children?.length) nodes(node.children);
    }
  };
  nodes(out.objects);
  return out;
}

/** One entry of the formula reference: what to type and what it gives. */
export interface ExpressionReferenceEntry {
  /** As typed in a formula: `scene.time`, `clamp(x, min, max)`. */
  name: string;
  about: string;
}

/** What each `scene.*` variable means, keyed like `describeSceneVariables` (`time`, `mouse.posX`…). */
const VARIABLE_ABOUT: Record<string, string> = {
  cycle: 'Completed duration windows, from 0 (keeps growing with Infinite time)',
  time: 'Seconds since the start',
  frame: 'Current frame number',
  fps: 'Frames per second of the animation (default 30)',
  duration: 'Length of the timeline, in seconds',
  progress: 'Time / duration, from 0 to 1',
  seedGenerator: 'The document seed (changes on each beat with Seed every)',
  width: 'Document width in px (0 without a fixed document)',
  height: 'Document height in px (0 without a fixed document)',
  aspect: 'Width / height',
  dt: 'Seconds since the previous frame (one frame in renders)',
  scroll: 'How far the host page has scrolled, from 0 to 1',
  pixelRatio: 'Screen pixel density',
  'clock.hour': 'Real local hour (0 in renders and exports)',
  'clock.minute': 'Real local minute (0 in renders and exports)',
  'clock.second': 'Real local second, with fractions (0 in renders and exports)',
  'mouse.posX': 'Pointer X in scene px',
  'mouse.posY': 'Pointer Y in scene px',
  'mouse.fracX': 'Pointer X across the document, from 0 to 1',
  'mouse.fracY': 'Pointer Y across the document, from 0 to 1',
  'mouse.down': '1 while the primary button is pressed',
  'mouse.inside': '1 while the pointer is over the document',
  'mouse.velX': 'Horizontal pointer speed in px/s (smoothed)',
  'mouse.velY': 'Vertical pointer speed in px/s (smoothed)',
  'mouse.downMs': 'Milliseconds the primary button has been held (the last press after release)',
  'mouse.rightDown': '1 while the right button is pressed',
  'mouse.middleDown': '1 while the middle button is pressed',
  'mouse.clicks': 'Primary clicks so far',
  'mouse.clickMs': 'Milliseconds since the last click (0 before any)',
  'mouse.wheel': 'Accumulated wheel, 1 per 100 px (positive = down)',
};

const FUNCTION_ABOUT: Record<string, ExpressionReferenceEntry> = {
  min: { name: 'min(a, b, …)', about: 'Smallest value' },
  max: { name: 'max(a, b, …)', about: 'Largest value' },
  clamp: { name: 'clamp(x, min, max)', about: 'x kept between min and max' },
  lerp: { name: 'lerp(a, b, t)', about: 'From a (t = 0) to b (t = 1)' },
  abs: { name: 'abs(x)', about: 'Absolute value' },
  round: { name: 'round(x)', about: 'Nearest integer' },
  floor: { name: 'floor(x)', about: 'Integer below' },
  ceil: { name: 'ceil(x)', about: 'Integer above' },
  sqrt: { name: 'sqrt(x)', about: 'Square root' },
  pow: { name: 'pow(a, b)', about: 'a to the power of b (also a ^ b)' },
  sin: { name: 'sin(x)', about: 'Sine, x in radians' },
  cos: { name: 'cos(x)', about: 'Cosine, x in radians' },
  tan: { name: 'tan(x)', about: 'Tangent, x in radians' },
  atan: { name: 'atan(x)', about: 'Arc tangent, in radians' },
  atan2: { name: 'atan2(y, x)', about: 'Angle of the point (x, y), in radians' },
  deg: { name: 'deg(x)', about: 'Radians to degrees, for angle parameters' },
  random: { name: 'random(min, max, seed?)', about: 'Reproducible random value; the seed varies it (e.g. scene.cycle)' },
  'scene.countDown': { name: 'scene.countDown(seconds)', about: 'Whole seconds left until that time, never below 0' },
};

/**
 * Everything a formula can use, for a reference panel: the `scene.*` variables in the order
 * `describeSceneVariables` gives them (`key` is its name there), and the functions.
 */
export function expressionReference(): { variables: (ExpressionReferenceEntry & { key: string })[]; functions: ExpressionReferenceEntry[] } {
  const keys = Object.keys(describeSceneVariables(evaluateSceneVariables({ version: 1, objects: [] })));
  return {
    variables: keys.map((key) => ({ key, name: `scene.${key}`, about: VARIABLE_ABOUT[key] ?? '' })),
    functions: Object.keys(ARITY).map((fn) => FUNCTION_ABOUT[fn] ?? { name: fn, about: '' }),
  };
}
