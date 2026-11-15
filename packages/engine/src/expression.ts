import { sceneDuration } from './scene';
import type { SceneNode, SceneV2 } from './document';

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
}

type Expr =
  | { kind: 'number'; value: number }
  | { kind: 'variable'; name: `scene.${'time' | 'frame' | 'fps' | 'duration' | 'progress'}` | 'pi' | 'e' }
  | { kind: 'unary'; op: '+' | '-'; value: Expr }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '%' | '^' | '**'; left: Expr; right: Expr }
  | { kind: 'call'; name: string; args: Expr[] };

const FUNCTIONS: Record<string, (args: number[]) => number> = {
  abs: ([x]) => Math.abs(x!),
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
  abs: [1, 1], ceil: [1, 1], clamp: [3, 3], cos: [1, 1], floor: [1, 1], lerp: [3, 3], 'scene.countDown': [1, 1],
  max: [1, Infinity], min: [1, Infinity], pow: [2, 2], round: [1, 1], sin: [1, 1], sqrt: [1, 1], tan: [1, 1],
};
const SCENE_VARIABLES = {
  time: 'scene.time', frame: 'scene.frame', fps: 'scene.fps', duration: 'scene.duration', progress: 'scene.progress',
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
        if (!(field && field in SCENE_VARIABLES)) throw new Error('Use a supported scene variable: time, frame, fps, duration, or progress.');
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
  function multiply(): Expr {
    let left = power();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = take() as '*' | '/' | '%';
      left = { kind: 'binary', op, left, right: power() };
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
    if (tree.name.startsWith('scene.')) return context[tree.name.slice(6) as keyof ExpressionContext];
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
export function sceneHasExpressions(scene: SceneV2): boolean {
  const has = (params?: Record<string, unknown>) => Object.values(params ?? {}).some(isNumericExpression);
  const stackHas = (stack: SceneNode['stack']): boolean => stack.some((m) => has(m.params) || stackHas(m.children ?? []));
  const nodeHas = (node: SceneNode): boolean =>
    (node.kind === 'group' && !!node.composition) || (node.kind === 'shape' && (has(node.params) || (node.shape === 'text' && hasTextExpressions(node.params.text)))) || stackHas(node.stack) || (node.kind === 'group' && node.children.some(nodeHas));
  return scene.objects.some(nodeHas);
}

/** Evaluate scene formulas on a clone so a changing playhead never overwrites the saved expression. */
export function evaluateSceneExpressions(scene: SceneV2): SceneV2 {
  if (!sceneHasExpressions(scene)) return scene;
  const out = structuredClone(scene) as SceneV2;
  const time = out.at ?? 0;
  const fps = out.animation?.fps ?? 30;
  const duration = sceneDuration(out);
  const context: ExpressionContext = {
    time,
    frame: Math.floor(time * fps + 1e-9),
    fps,
    duration,
    progress: duration > 0 ? Math.max(0, Math.min(1, time / duration)) : 0,
  };
  const params = (values?: Record<string, unknown>) => {
    if (!values) return;
    for (const [key, value] of Object.entries(values)) {
      if (!isNumericExpression(value)) continue;
      try { values[key] = evaluateExpression(value.$expr, context); }
      catch { values[key] = value.fallback; }
    }
  };
  const stack = (items: SceneNode['stack']) => {
    for (const item of items) { params(item.params); stack(item.children ?? []); }
  };
  const nodes = (items: SceneNode[]) => {
    for (const node of items) {
      if (node.kind === 'shape') {
        params(node.params);
        if (node.shape === 'text' && hasTextExpressions(node.params.text)) {
          node.params.text = node.params.text.replace(/\{\{([\s\S]*?)\}\}/g, (whole, source: string) => {
            try {
              return evaluateTextExpression(source.trim(), context);
            } catch { return whole; }
          });
        }
      }
      if (node.kind === 'group' && node.composition) params(node.composition.params);
      stack(node.stack);
      if (node.kind === 'group') nodes(node.children);
    }
  };
  nodes(out.objects);
  return out;
}
