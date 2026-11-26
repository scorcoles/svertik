import { CLOCK_FIELDS, DEVICE_FIELDS, ELEMENT_FIELDS, POINTER_FIELDS, expressionReference, type SceneV1 } from '@svertik/engine';

/** One suggestion: what it shows, what it puts in (a call comes with its parenthesis) and a short note. */
export interface Completion { label: string; insert: string; detail?: string }
/** Suggestions for the name being typed: they replace the text from `from` to the caret. */
export interface Completions { from: number; items: Completion[] }

/** What the place being edited can read: the scene's values by path and the selection's own (for `this.`). */
export interface CompletionScope {
  scene: SceneV1 | null;
  /** `scene.object.*` values by path (`esfera.x`, `esfera.grid.angle`). */
  objects?: Record<string, number>;
  /** `this.*` names of the selection. */
  self?: string[];
  /** Inside Each: `element.*` makes sense. */
  element?: boolean;
  /** The console's commands, offered at the start of the line (`label` is their signature). */
  commands?: Completion[];
}

const reference = expressionReference();
const about = new Map(reference.variables.map((v) => [v.name, v.about]));
const FUNCTIONS: Completion[] = reference.functions.map((f) => ({ label: f.name, insert: `${f.name.replace(/\(.*$/, '')}(`, detail: f.about }));
const SCENE: Completion[] = [
  ...reference.variables.filter((v) => !v.key.includes('.') && !v.key.includes('*') && !v.key.includes('[')).map((v) => ({ label: v.key, insert: v.key, detail: v.about })),
  { label: 'custom', insert: 'custom.', detail: 'Document variables' },
  { label: 'object', insert: 'object.', detail: 'Another object’s values, by its name' },
  { label: 'mouse', insert: 'mouse.', detail: 'The pointer, live in Play' },
  { label: 'clock', insert: 'clock.', detail: 'The real local time' },
  { label: 'device', insert: 'device.', detail: 'Phone tilt, in Play' },
  { label: 'countDown()', insert: 'countDown(', detail: 'Whole seconds left until that time' },
];
const fields = (prefix: string, names: readonly string[]): Completion[] => names.map((n) => ({ label: n, insert: n, detail: about.get(`${prefix}${n}`) }));

/** The next names after `path.` among the object values (`esfera` → x, y, grid…; `esfera.grid` → its values). */
function objectNext(objects: Record<string, number>, path: string[]): Completion[] {
  const prefix = path.length ? `${path.join('.')}.` : '';
  const next = new Map<string, boolean>();
  for (const key of Object.keys(objects)) {
    if (!key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length).split('.');
    const name = rest[0]!;
    // A value ends here; a longer path goes on (an effect, or props).
    next.set(name, (next.get(name) ?? false) || rest.length > 1);
  }
  return [...next].map(([name, more]) => ({ label: name, insert: more ? `${name}.` : name, detail: more ? undefined : formatNumber(objects[`${prefix}${name}`]) }));
}
const formatNumber = (n: number | undefined) => (n === undefined ? undefined : String(Math.round(n * 1000) / 1000));

/**
 * What can come at the caret of a formula: after `scene.` the scene's values, after `scene.object.` the objects and
 * then their values and effects, after `this.` the selection's values, `element.` inside Each, and otherwise the
 * functions and where names start. `before` is the formula up to the caret.
 */
export function completionsAt(before: string, scope: CompletionScope): Completions | null {
  const typed = /([A-Za-z_][A-Za-z_0-9]*(?:\.[A-Za-z_0-9]*)*)$|(?:^|[^A-Za-z_0-9.])$/.exec(before);
  const chain = typed?.[1] ?? '';
  // Right after a number, or in the middle of one (1.5), there is nothing to suggest.
  if (/[0-9.]$/.test(before) && !chain) return null;
  const parts = chain.split('.');
  const partial = parts.pop() ?? '';
  const from = before.length - partial.length;
  const [root, second, ...rest] = parts;
  let items: Completion[];
  if (!parts.length) {
    items = [
      { label: 'scene', insert: 'scene.', detail: 'Time, pointer, document, other objects…' },
      ...(scope.self?.length ? [{ label: 'this', insert: 'this.', detail: 'Values of this object or effect' }] : []),
      ...(scope.element ? [{ label: 'element', insert: 'element.', detail: 'The copy being built (Each)' }] : []),
      { label: 'props', insert: 'props.', detail: about.get('props.name') },
      { label: 'pi', insert: 'pi', detail: '3.14159…' },
      ...FUNCTIONS,
      ...(before.trim() === partial ? scope.commands ?? [] : []),
    ];
  } else if (root === 'scene' && parts.length === 1) items = SCENE;
  else if (root === 'scene' && second === 'mouse' && !rest.length) items = fields('scene.mouse.', POINTER_FIELDS);
  else if (root === 'scene' && second === 'clock' && !rest.length) items = fields('scene.clock.', CLOCK_FIELDS);
  else if (root === 'scene' && second === 'device' && !rest.length) items = fields('scene.device.', Object.keys(DEVICE_FIELDS));
  else if (root === 'scene' && second === 'custom' && !rest.length) items = Object.keys(scope.scene?.custom ?? {}).map((k) => ({ label: k, insert: k, detail: 'Document variable' }));
  else if (root === 'scene' && second === 'object') items = objectNext(scope.objects ?? {}, rest);
  else if (root === 'this' && parts.length === 1) items = (scope.self ?? []).map((k) => ({ label: k, insert: k }));
  else if (root === 'element' && parts.length === 1) items = fields('element.', ELEMENT_FIELDS);
  else return null;
  const q = partial.toLowerCase();
  const starts = items.filter((i) => i.label.toLowerCase().startsWith(q));
  const contains = q ? items.filter((i) => !i.label.toLowerCase().startsWith(q) && i.label.toLowerCase().includes(q)) : [];
  const out = [...starts, ...contains];
  // Nothing typed yet after a name with no dot: only once something is typed (or right after a dot).
  if (!out.length || (!parts.length && !q)) return null;
  if (out.length === 1 && out[0]!.insert === partial) return null;
  return { from, items: out.slice(0, 50) };
}

/** The call the caret is in: its signature, the argument being written (from 0) and what it does. */
export interface Signature { name: string; params: string[]; active: number; about?: string }

/**
 * Parameter help: inside `clamp(x, |`, the signature `clamp(x, min, max)` with `min` as the argument being written.
 * It looks for the innermost call still open before the caret (nested calls, `scene.countDown(`, commands).
 */
export function signatureAt(before: string, scope: Pick<CompletionScope, 'commands'> = {}): Signature | null {
  let depth = 0, commas = 0;
  for (let i = before.length - 1; i >= 0; i--) {
    const c = before[i]!;
    if (c === ')' || c === ']') depth++;
    else if (c === '[') depth--;
    else if (c === ',' && depth === 0) commas++;
    else if (c === '(') {
      if (depth > 0) { depth--; continue; }
      const callee = /([A-Za-z_][A-Za-z_0-9]*(?:\s*\.\s*[A-Za-z_][A-Za-z_0-9]*)*)\s*$/.exec(before.slice(0, i))?.[1]?.replace(/\s+/g, '');
      if (!callee) return null;
      const known = [...reference.functions.map((f) => ({ label: f.name, detail: f.about })), ...(scope.commands ?? [])]
        .find((f) => f.label.replace(/\(.*$/, '') === callee);
      if (!known) return null;
      const inner = /\((.*)\)$/.exec(known.label)?.[1] ?? '';
      const params = inner ? inner.split(/,\s*/) : [];
      // Open-ended lists (min(a, b, …), pick(i, a, b, …)) stay on their last named argument.
      const variadic = params.at(-1) === '…';
      const active = variadic ? Math.min(commas, params.length - 2) : commas;
      return { name: callee, params, active, about: known.detail };
    }
  }
  return null;
}
