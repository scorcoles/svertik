import { noise2D, rng } from './random';
import { CLOCK_FIELDS, DEVICE_FIELDS, customNumber, neutralPointer, neutralRuntime, POINTER_FIELDS, sceneDuration, type SceneRuntime, type ScenePointer } from './scene';
import type { SceneNode, SceneV1 } from './document';
import { objectValues, readsObjects, sceneNames } from './object-names';

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
  /** Native and explicitly forwarded values received from the direct parent. */
  props?: Record<string, number>;
  /** The copy being built, inside a shape's Each (`element.*`); absent elsewhere. */
  element?: Partial<ElementValues>;
  /** The other numeric values of the object or effect the formula belongs to (`this.name`). */
  self?: Record<string, number>;
  /** Values of the scene's objects and effects by path (`esfera.x`, `esfera.grid.each.rotation`): `scene.object.*`. */
  objects?: Record<string, number>;
  /** Numeric values exposed by direct children, keyed by their stable scene IDs. */
  children?: Record<string, Record<string, number>>;
  /** The live pointer (`scene.mouse.*`); the neutral one when absent. */
  mouse?: Partial<ScenePointer>;
  /** The document's size (`scene.width`, `scene.height`); 0 when the scene has no fixed document. */
  width?: number;
  height?: number;
  /** Frame time, page scroll, screen density and the real clock (`scene.dt`, `scene.scroll`, …); neutral when absent. */
  runtime?: Partial<SceneRuntime>;
  /** Where smooth() and spring() keep their value between frames; without it they return their target. */
  memory?: ExpressionMemory;
}

/** What `element.*` gives inside Each, for the copy being built. */
export interface ElementValues {
  /** Order of the copy, from 0. */
  index: number;
  /** How many copies there are. */
  count: number;
  /** Grid row and column, from 0 (0 outside a grid). */
  row: number;
  column: number;
  /** Place across the grid (or along the copies), from 0 to 1. */
  u: number;
  v: number;
  /** Distance from the centre of the copies: 0 at the centre, 1 for the furthest copy. */
  distance: number;
  /** A fixed random number from 0 to 1 for this copy. */
  random: number;
}
export const ELEMENT_FIELDS = ['index', 'count', 'row', 'column', 'u', 'v', 'distance', 'random'] as const;

/** What smooth() / spring() remember of the last frame: when, the value, and (spring) its speed. */
interface FollowState { t: number; v: number; vel: number }
/**
 * The state of smooth() and spring() between frames, by call (each formula's parsed call) and random salt.
 * One per engine: only its frame-by-frame evaluation uses it, never a look at other times (trails, history).
 */
export type ExpressionMemory = WeakMap<object, Map<number, FollowState>>;
export const createExpressionMemory = (): ExpressionMemory => new WeakMap();

export interface SceneExpressionValues extends ExpressionContext {
  /** Zero-based duration cycle; it keeps increasing when the scene has Infinite enabled. */
  cycle: number;
}

type Expr =
  | { kind: 'number'; value: number }
  | { kind: 'child'; id: string; property: string }
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
  // x from [inMin, inMax] to [outMin, outMax], not clamped (like lerp, it extrapolates).
  map: ([x, a, b, c, d]) => (b === a ? c! : c! + ((x! - a!) * (d! - c!)) / (b! - a!)),
  // Always the sign of b: mod(-1, 3) = 2, where -1 % 3 = -1.
  mod: ([a, b]) => a! - b! * Math.floor(a! / b!),
  // 0 below edge, 1 from it on (as in GLSL): a gate, since formulas have no comparisons.
  step: ([edge, x]) => (x! < edge! ? 0 : 1),
  smoothstep: ([a, b, x]) => { const t = Math.min(1, Math.max(0, b === a ? (x! < a! ? 0 : 1) : (x! - a!) / (b! - a!))); return t * t * (3 - 2 * t); },
  // Cubic easing of t, clamped to 0–1.
  easeIn: ([t]) => { const u = Math.min(1, Math.max(0, t!)); return u * u * u; },
  easeOut: ([t]) => { const u = 1 - Math.min(1, Math.max(0, t!)); return 1 - u * u * u; },
  easeInOut: ([t]) => { const u = Math.min(1, Math.max(0, t!)); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; },
  // The value at index i (floored, wrapping): pick(mod(scene.mouse.clicks, 3), 10, 20, 40).
  pick: ([i, ...values]) => values[((Math.floor(i!) % values.length) + values.length) % values.length]!,
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
  map: [5, 5], mod: [2, 2], step: [2, 2], smoothstep: [3, 3], easeIn: [1, 1], easeOut: [1, 1], easeInOut: [1, 1], pick: [2, Infinity],
  noise: [1, 2], smooth: [1, 2], spring: [1, 3],
};
const SCENE_VARIABLES = {
  cycle: 'scene.cycle', time: 'scene.time', frame: 'scene.frame', fps: 'scene.fps', duration: 'scene.duration', progress: 'scene.progress', seedGenerator: 'scene.seedGenerator', width: 'scene.width', height: 'scene.height',
  aspect: 'scene.aspect', dt: 'scene.dt', scroll: 'scene.scroll', pixelRatio: 'scene.pixelRatio',
} as const;
const parsed = new Map<string, Expr>();

function parse(source: string): Expr {
  if (source.length > 4096) throw new Error('Expression is too long (maximum 4096 characters).');
  const tokens = source.match(/\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|\*\*|[\[\]()+\-*/%^.,])/gy);
  if (!tokens) throw new Error('Enter an expression.');
  const list = tokens.map((t) => t.trim()).filter(Boolean);
  const consumed = tokens.join('').length;
  if (source.slice(consumed).trim()) throw new Error(`Unexpected input near “${source.slice(consumed).trim()}”.`);
  let i = 0;
  if (tokens.length > 1024) throw new Error('Expression is too complex (maximum 1024 tokens).');
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
      if (token === 'children') {
        const unquote = (value: string | undefined) => value && (/^"/.test(value) || /^'/.test(value)) ? value.slice(1, -1).replace(/\\([\\"'])/g, '$1') : null;
        let id: string | null, property: string | null;
        if (peek() === '[') {
          take(); id = unquote(take()); expect(']'); expect('.'); property = take() ?? null;
        } else if (peek() === '(') {
          take(); id = unquote(take()); expect(','); property = unquote(take()); expect(')');
        } else throw new Error('Use children["child-id"].property to read a child value.');
        if (!id || !property || !/^[A-Za-z_][A-Za-z_0-9]*$/.test(property)) throw new Error('Use children["child-id"].property to read a child value.');
        return { kind: 'child', id, property };
      }
      if (token === 'element') {
        expect('.');
        const key = take();
        if (!key || !(ELEMENT_FIELDS as readonly string[]).includes(key)) throw new Error(`Use a supported element value: ${ELEMENT_FIELDS.join(', ')}.`);
        return { kind: 'variable', name: `element.${key}` };
      }
      if (token === 'this') {
        expect('.');
        const key = take();
        if (!key || !/^[A-Za-z_][A-Za-z_0-9]*$/.test(key)) throw new Error('Use a value name after this., e.g. this.outer.');
        return { kind: 'variable', name: `this.${key}` };
      }
      if (token === 'props') {
        expect('.');
        const key = take();
        if (!key || !/^[A-Za-z_][A-Za-z_0-9]*$/.test(key)) throw new Error('Use a valid prop name after props.');
        return { kind: 'variable', name: `props.${key}` };
      }
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
        if (field === 'object') {
          // scene.object.<object>[.<effect>…].<value>: a path of names, at least the object and one value.
          const parts: string[] = [];
          do {
            expect('.');
            const part = take();
            if (!part || !/^[A-Za-z_][A-Za-z_0-9]*$/.test(part)) throw new Error('Use scene.object.<object name>.<value>, e.g. scene.object.sphere.x.');
            parts.push(part);
          } while (peek() === '.');
          if (parts.length < 2) throw new Error('Use scene.object.<object name>.<value>, e.g. scene.object.sphere.x.');
          return { kind: 'variable', name: `scene.object.${parts.join('.')}` };
        }
        if (field === 'device') {
          expect('.');
          const key = take();
          if (!key || !Object.hasOwn(DEVICE_FIELDS, key)) throw new Error(`Use a device field after scene.device.: ${Object.keys(DEVICE_FIELDS).join(', ')}.`);
          return { kind: 'variable', name: `scene.device.${key}` };
        }
        if (field === 'mouse') {
          expect('.');
          const key = take();
          if (!key || !(POINTER_FIELDS as readonly string[]).includes(key)) throw new Error(`Use a pointer field after scene.mouse.: ${POINTER_FIELDS.join(', ')}.`);
          return { kind: 'variable', name: `scene.mouse.${key}` };
        }
        if (!(field && field in SCENE_VARIABLES)) throw new Error('Use a supported scene variable: time, cycle, frame, fps, duration, progress, seedGenerator, width, height, aspect, dt, scroll, pixelRatio, clock.hour, device.tiltX, mouse.posX, or custom.name.');
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
  if (tree.kind === 'child') {
    const value = context.children?.[tree.id]?.[tree.property];
    if (!Number.isFinite(value)) throw new Error(`Unknown child value “${tree.id}.${tree.property}”.`);
    return value!;
  }
  if (tree.kind === 'variable') {
    if (tree.name.startsWith('element.')) {
      const value = context.element?.[tree.name.slice('element.'.length) as keyof ElementValues];
      if (!Number.isFinite(value)) throw new Error('element.* is only available in Each.');
      return value!;
    }
    if (tree.name.startsWith('this.')) {
      const key = tree.name.slice('this.'.length);
      const value = context.self?.[key];
      if (!Number.isFinite(value)) throw new Error(`Unknown value “this.${key}”.`);
      return value!;
    }
    if (tree.name.startsWith('props.')) {
      const key = tree.name.slice('props.'.length);
      const value = context.props?.[key];
      if (!Number.isFinite(value)) throw new Error(`Unknown prop “${key}”.`);
      return value!;
    }
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
    if (tree.name.startsWith('scene.object.')) {
      const path = tree.name.slice('scene.object.'.length);
      const value = context.objects?.[path];
      if (!Number.isFinite(value)) throw new Error(`Unknown object value “${path}”.`);
      return value!;
    }
    if (tree.name.startsWith('scene.device.')) {
      const key = DEVICE_FIELDS[tree.name.slice('scene.device.'.length) as keyof typeof DEVICE_FIELDS];
      const value = context.runtime?.[key];
      return Number.isFinite(value) ? value! : 0;
    }
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
  if (tree.name === 'noise') {
    if (!args.every(Number.isFinite) || !Number.isFinite(context.seedGenerator)) throw new Error('noise() expects finite values.');
    // One curve per document seed; the optional seed picks another line through the same 2D field.
    const field = noiseOf(context.seedGenerator);
    return Math.max(-1, Math.min(1, field(args[0]!, (args[1] ?? 0) * 17.31 + 0.5)));
  }
  if (tree.name === 'smooth' || tree.name === 'spring') return follow(tree, args, context);
  return FUNCTIONS[tree.name]!(args);
}

const noiseFields = new Map<number, (x: number, y: number) => number>();
function noiseOf(seed: number) {
  let field = noiseFields.get(seed);
  if (!field) {
    if (noiseFields.size > 64) noiseFields.clear();
    field = noise2D(seed);
    noiseFields.set(seed, field);
  }
  return field;
}

/**
 * smooth(x, seconds): eases towards x, reaching about 95% of a jump in `seconds` (0.3 by default).
 * spring(x, seconds, bounce): follows x like a spring of that period; bounce 0–1 (0.5 by default) overshoots.
 * They remember the last frame in the context's memory; without one (a single frame, a look at another time)
 * they are x. A step back in time or a jump of more than a second starts again from x.
 */
function follow(tree: Expr, args: number[], context: ExpressionContext): number {
  const target = args[0]!;
  const memory = context.memory;
  if (!memory || !Number.isFinite(target) || !Number.isFinite(context.time)) return target;
  let byCall = memory.get(tree);
  if (!byCall) memory.set(tree, (byCall = new Map()));
  const salt = context.randomSalt ?? 0;
  const s = byCall.get(salt);
  const dt = s ? context.time - s.t : -1;
  if (!s || dt < 0 || dt > 1) {
    byCall.set(salt, { t: context.time, v: target, vel: 0 });
    return target;
  }
  // The same frame evaluated again: the same answer, without stepping twice.
  if (dt === 0) return s.v;
  s.t = context.time;
  const seconds = Math.max(1e-3, Number.isFinite(args[1]) ? args[1]! : tree.kind === 'call' && tree.name === 'smooth' ? 0.3 : 0.5);
  if (tree.kind === 'call' && tree.name === 'smooth') s.v += (target - s.v) * (1 - Math.exp((-3 * dt) / seconds));
  else {
    const w = (2 * Math.PI) / seconds;
    const zeta = 1 - Math.min(0.99, Math.max(0, Number.isFinite(args[2]) ? args[2]! : 0.5));
    // Small steps keep a stiff spring stable at any frame rate.
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      s.vel += (w * w * (target - s.v) - 2 * zeta * w * s.vel) * h;
      s.v += s.vel * h;
    }
  }
  return s.v;
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
  const fixed = source.trim().match(/^fixed\((.*?),\s*(\d+)(?:\s*,\s*(\d+))?\)$/);
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
  const stackHas = (stack?: SceneNode['stack']): boolean => (stack ?? []).some((m) => has(m.params, true) || has(m.props, true) || stackHas(m.children));
  const nodeHas = (node: SceneNode): boolean =>
    has(node.props, true) || (node.kind === 'instance' && has(node.mouse, true)) || (node.kind === 'group' && !!node.composition) || (node.kind === 'shape' && (has(node.params, true) || (node.shape === 'text' && hasTextExpressions(node.params.text)))) || stackHas(node.stack) || !!node.children?.some(nodeHas);
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
  for (const key of Object.keys(DEVICE_FIELDS)) out[`device.${key}`] = read(`scene.device.${key}`);
  for (const key of POINTER_FIELDS) out[`mouse.${key}`] = read(`scene.mouse.${key}`);
  return out;
}

/** Resolve the live values exposed to expressions, without evaluating every object parameter. */
export function evaluateSceneVariables(scene: SceneV1, time = scene.at ?? 0, randomSalt = 0, memory?: ExpressionMemory, objects?: Record<string, number>): SceneExpressionValues {
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
    ...(memory ? { memory } : {}),
    ...(objects ? { objects } : {}),
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

/** The context formulas run in without a scene (an Each evaluated outside the scene's formula pass). */
const BARE_CONTEXT: ExpressionContext = { time: 0, frame: 0, fps: 30, duration: 0, progress: 0, seedGenerator: 1, custom: {} };

/**
 * Parameters with formulas evaluated for one element (Each): numbers stay, formulas (also inside points) run with
 * `element` in `context` (the Each's own context from the scene's formula pass); one that fails gives its fallback.
 */
export function evaluateForElement(params: Record<string, unknown>, element: ElementValues, context?: unknown): Record<string, unknown> {
  const ctx: ExpressionContext = { ...((context as ExpressionContext | undefined) ?? BARE_CONTEXT), element };
  const out: Record<string, unknown> = { ...params };
  resolveTogether([out], ctx);
  return out;
}

/**
 * Resolves the formulas of one object or effect together, so each can read the others as `this.name`
 * (`this.outer - 50`). Plain numbers are known from the start; formulas resolve in whatever order their
 * dependencies allow, and one left in a cycle (or failing) takes its fallback. Point lists can read `this`
 * but are not readable themselves. The first record wins when two hold the same name.
 */
function resolveTogether(records: (Record<string, unknown> | undefined)[], ctx: ExpressionContext, defaults?: Record<string, unknown>): void {
  const self: Record<string, number> = {};
  const pending: [Record<string, unknown>, string, NumericExpression][] = [];
  for (const values of records) {
    for (const [key, value] of Object.entries(values ?? {})) {
      if (typeof value === 'number' && Number.isFinite(value)) { if (!(key in self)) self[key] = value; }
      else if (isNumericExpression(value)) pending.push([values!, key, value]);
    }
  }
  // Values left at their default (not saved in the scene) are readable too.
  for (const [key, value] of Object.entries(defaults ?? {})) if (!(key in self) && !pending.some(([, k]) => k === key) && typeof value === 'number' && Number.isFinite(value)) self[key] = value;
  const local: ExpressionContext = { ...ctx, self };
  let progress = true;
  while (pending.length && progress) {
    progress = false;
    for (let i = 0; i < pending.length; i++) {
      const [values, key, formula] = pending[i]!;
      let value: number;
      try { value = evaluateExpression(formula.$expr, local); } catch { continue; }
      values[key] = value;
      if (!(key in self)) self[key] = value;
      pending.splice(i--, 1);
      progress = true;
    }
  }
  for (const [values, key, formula] of pending) { values[key] = formula.fallback; if (!(key in self)) self[key] = formula.fallback; }
  for (const values of records) {
    for (const [key, value] of Object.entries(values ?? {})) {
      if (!Array.isArray(value)) continue;
      values![key] = value.map((v) => {
        if (!isNumericExpression(v)) return v;
        try { return evaluateExpression(v.$expr, local); } catch { return v.fallback; }
      });
    }
  }
}

/** Default parameter values of a shape or effect type, so `this.name` reads values the scene leaves unset. */
export type ParamDefaults = (owner: 'shape' | 'effect', type: string) => Record<string, unknown> | undefined;

type FormulaOptions = { randomSalt?: number; memory?: ExpressionMemory; defaults?: ParamDefaults };

/**
 * Evaluate scene formulas on a clone so a changing playhead never overwrites the saved expression. Formulas that
 * read other objects (`scene.object.…`) are resolved in passes: each pass reads the values the previous one left
 * (the first, the fallbacks), until nothing changes; a cycle settles on what its last pass gave.
 */
export function evaluateSceneExpressions(scene: SceneV1, options: FormulaOptions = {}): SceneV1 {
  if (!sceneHasExpressions(scene) || !readsObjects(scene)) return evaluateOnce(scene, options);
  const names = sceneNames(scene);
  let objects: Record<string, number> | undefined;
  // Passes without the followers' memory (smooth, spring step once per frame: only the last pass, with it).
  const { memory, ...plain } = options;
  for (let pass = 0; pass < 6; pass++) {
    const next = objectValues(evaluateOnce(scene, { ...plain, objects }), names, options.defaults);
    const settled = objects && Object.keys(next).length === Object.keys(objects).length && Object.entries(next).every(([k, v]) => objects![k] === v);
    objects = next;
    if (settled) break;
  }
  return evaluateOnce(scene, { ...options, objects });
}

function evaluateOnce(scene: SceneV1, options: FormulaOptions & { objects?: Record<string, number> }): SceneV1 {
  if (!sceneHasExpressions(scene)) return scene;
  const out = structuredClone(scene) as SceneV1;
  const time = out.at ?? 0;
  const fps = out.animation?.fps ?? 30;
  const duration = sceneDuration(out);
  const context: ExpressionContext = { ...evaluateSceneVariables(out, time, options.randomSalt ?? 0, options.memory, options.objects), randomSalt: options.randomSalt ?? 0 };
  const params = (values?: Record<string, unknown>, points = false, ctx: ExpressionContext = context) => {
    if (!values) return;
    const one = (value: NumericExpression) => {
      try { return evaluateExpression(value.$expr, ctx); }
      catch { return value.fallback; }
    };
    for (const [key, value] of Object.entries(values)) {
      if (isNumericExpression(value)) values[key] = one(value);
      else if (points && Array.isArray(value)) values[key] = value.map(v => isNumericExpression(v) ? one(v) : v);
    }
  };
  const numericValues = (values?: Record<string, unknown>, ctx: ExpressionContext = context): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(values ?? {})) {
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
      else if (isNumericExpression(value)) {
        try { out[key] = evaluateExpression(value.$expr, ctx); }
        catch { out[key] = value.fallback; }
      }
    }
    return out;
  };
  const stack = (items: SceneNode['stack'], inherited: Record<string, number>, exposedChildren: Record<string, Record<string, number>> = {}) => {
    for (const item of items) {
      const children: Record<string, Record<string, number>> = {};
      for (const child of item.children ?? []) children[child.id] = numericValues(child.params);
      const ctx: ExpressionContext = { ...context, props: inherited, children: { ...exposedChildren, ...children } };
      resolveTogether([item.params], ctx, options.defaults?.('effect', item.type));
      if (item.type === 'each') {
        // Each evaluates its children's formulas per element (element.*): keep them, with the context they run in.
        const { memory: _memory, ...plain } = ctx;
        item.eachContext = plain;
        continue;
      }
      const custom = numericValues(item.props, ctx);
      if (item.props) item.props = custom;
      stack(item.children ?? [], { ...inherited, ...numericValues(item.params), ...custom }, children);
    }
  };
  const parentNativeById = new Map<string, Record<string, number>>();
  const nodes = (items: SceneNode[], inheritedCustom: Record<string, number> = {}) => {
    for (const node of items) {
      // `props.*` receives the direct parent's native values plus explicitly forwarded custom values.
      // Custom values flow through the full ancestry; native values are replaced at each level.
      const parentNative = parentNativeById.get(node.id) ?? {};
      const directChildren: Record<string, Record<string, number>> = {};
      for (const child of node.children ?? []) {
        const childValues = child.kind === 'shape' ? numericValues(child.params) : {};
        Object.assign(childValues, numericValues(child.transform as Record<string, unknown>), numericValues(child.opacity === undefined ? undefined : { opacity: child.opacity }), numericValues(child.props));
        directChildren[child.id] = childValues;
      }
      const nodeContext: ExpressionContext = { ...context, props: { ...parentNative, ...inheritedCustom }, children: directChildren };
      // Shape values, placement and opacity resolve together, so `this.name` reads any of them.
      const opacity = node.opacity === undefined ? undefined : { opacity: node.opacity as unknown };
      resolveTogether(
        [node.kind === 'shape' ? node.params as Record<string, unknown> : undefined, node.transform as Record<string, unknown> | undefined, opacity],
        nodeContext,
        { x: 0, y: 0, scale: 1, rotation: 0, ...(node.kind === 'shape' ? options.defaults?.('shape', node.shape) : undefined) },
      );
      if (opacity) node.opacity = opacity.opacity as number;
      const ownCustom = numericValues(node.props, nodeContext);
      if (node.props) node.props = ownCustom;
      const outgoingCustom = { ...inheritedCustom, ...ownCustom };
      if (node.kind === 'shape') {
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
            ...nodeContext,
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
      if (node.kind === 'instance' && node.mouse) params(node.mouse, true, nodeContext);
      if (node.kind === 'group' && node.composition) { params(node.composition.params, false, nodeContext); params(node.composition.modulation?.params, false, nodeContext); }
      stack(node.stack, { ...(node.kind === 'shape' ? numericValues(node.params) : {}), ...numericValues(node.transform as Record<string, unknown>), ...outgoingCustom }, directChildren);
      if (node.children?.length) {
        const native = node.kind === 'shape' ? numericValues(node.params, nodeContext) : {};
        Object.assign(native, numericValues(node.transform as Record<string, unknown>, nodeContext));
        if (typeof node.opacity === 'number') native.opacity = node.opacity;
        // Carry the direct parent's native values on each child during this expression pass.
        for (const child of node.children) parentNativeById.set(child.id, native);
        nodes(node.children, outgoingCustom);
        for (const child of node.children) parentNativeById.delete(child.id);
      }
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

const ELEMENT_ABOUT: Record<(typeof ELEMENT_FIELDS)[number], string> = {
  index: 'Each only: order of the copy, from 0',
  count: 'Each only: how many copies there are',
  row: 'Each only: grid row of the copy, from 0',
  column: 'Each only: grid column of the copy, from 0',
  u: 'Each only: place across the grid (or along the copies), from 0 to 1',
  v: 'Each only: place down the grid, from 0 to 1',
  distance: 'Each only: distance from the centre of the copies, 0 at the centre to 1 at the furthest',
  random: 'Each only: a fixed random number from 0 to 1 for the copy',
};

/** What each `scene.*` variable means, keyed like `describeSceneVariables` (`time`, `mouse.posX`…). */
const VARIABLE_ABOUT: Record<string, string> = {
  'this.*': 'Another numeric value of the same object or effect, e.g. this.outer - 50',
  'props.*': 'Numeric values from the direct parent, plus custom props explicitly forwarded through the hierarchy',
  'children["id"].property': 'A numeric value from a direct child, addressed by its stable ID and property name',
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
  'device.tiltX': 'Phone tilt left (−1) to right (1), from how it was held; in Play on phones and tablets',
  'device.tiltY': 'Phone tilt, top edge away (−1) to towards you (1), from how it was held',
  'device.active': '1 while a motion sensor feeds the tilt (0 on a computer and in renders)',
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
  map: { name: 'map(x, inMin, inMax, outMin, outMax)', about: 'x from one range to another (not clamped)' },
  mod: { name: 'mod(a, b)', about: 'Remainder with the sign of b: mod(-1, 3) = 2' },
  step: { name: 'step(edge, x)', about: '0 below edge, 1 from it on (a gate)' },
  smoothstep: { name: 'smoothstep(a, b, x)', about: 'Smooth 0 → 1 as x goes from a to b' },
  easeIn: { name: 'easeIn(t)', about: 'Starts slow (t from 0 to 1)' },
  easeOut: { name: 'easeOut(t)', about: 'Ends slow (t from 0 to 1)' },
  easeInOut: { name: 'easeInOut(t)', about: 'Slow at both ends (t from 0 to 1)' },
  pick: { name: 'pick(i, a, b, …)', about: 'The value at index i, from 0, wrapping' },
  noise: { name: 'noise(x, seed?)', about: 'Smooth noise in −1…1 along x (e.g. scene.time)' },
  smooth: { name: 'smooth(x, seconds?)', about: 'Follows x with lag: ~95% of a jump in seconds (0.3); while playing' },
  spring: { name: 'spring(x, seconds?, bounce?)', about: 'Follows x like a spring (period 0.5 s, bounce 0–1); while playing' },
};

/**
 * Everything a formula can use, for a reference panel: the `scene.*` variables in the order
 * `describeSceneVariables` gives them (`key` is its name there), and the functions.
 */
export function expressionReference(): { variables: (ExpressionReferenceEntry & { key: string })[]; functions: ExpressionReferenceEntry[] } {
  const keys = Object.keys(describeSceneVariables(evaluateSceneVariables({ version: 1, objects: [] })));
  return {
    variables: [
      ...keys.map((key) => ({ key, name: `scene.${key}`, about: VARIABLE_ABOUT[key] ?? '' })),
      { key: 'this.*', name: 'this.name', about: VARIABLE_ABOUT['this.*']! },
      { key: 'props.*', name: 'props.name', about: VARIABLE_ABOUT['props.*']! },
      ...ELEMENT_FIELDS.map((key) => ({ key: `element.${key}`, name: `element.${key}`, about: ELEMENT_ABOUT[key] })),
      { key: 'children["id"].property', name: 'children["id"].property', about: VARIABLE_ABOUT['children["id"].property']! },
    ],
    functions: Object.keys(ARITY).map((fn) => FUNCTION_ABOUT[fn] ?? { name: fn, about: '' }),
  };
}
