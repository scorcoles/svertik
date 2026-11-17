// Effects command line: catalog, search and parsing of commands like "twist angle=45 radius=0.8".
// The grammar is the scene JSON's (type and parameter names as they are), so a person and an agent
// write the same thing. No Svelte here: tested on its own (command.test.ts).

import type { ParamSchema, ParamSpec } from '@svertik/engine';

export interface CommandEntry {
  type: string;
  label: string;
  category: string;
  description: string;
  params: ParamSchema;
  /** Creates its own object (does not go to the selection's stack). */
  autonomous: boolean;
  /** A command verb (set, key…) listed among the results, not an effect. */
  verb?: boolean;
}

interface DefLike {
  type: string;
  label: string;
  kind?: string;
  family?: string;
  params: ParamSchema;
}

const CATEGORY: Record<string, string> = {
  deformer: 'Deform',
  generator: 'Generate',
  effector: 'Effect',
  style: 'Style',
  filter: 'Filters',
  glitch: 'Glitch',
  utils: 'Utils',
};

/**
 * Effects shown in another menu than their kind's. Rigid body is a deformer in the engine (it tags its
 * geometry), but it only means something under Physics, so it sits next to it, in Effect.
 */
const MENU_OF: Record<string, string> = { rigidbody: 'Effect' };

/** The menu category a definition belongs to ("Deform"…), so the UI uses the same words as the top bar. */
export const categoryOf = (d: { type?: string; kind?: string; family?: string }) => (d.type && MENU_OF[d.type]) || (CATEGORY[d.family ?? d.kind ?? ''] ?? 'Other');

export function buildCatalog(defs: readonly DefLike[], autonomous: readonly DefLike[], descriptions: Record<string, string>): CommandEntry[] {
  const entry = (d: DefLike, isAuto: boolean): CommandEntry => ({
    type: d.type,
    label: d.label,
    category: isAuto ? 'Generate' : categoryOf(d),
    description: descriptions[d.type] ?? '',
    params: d.params,
    autonomous: isAuto,
  });
  return [...defs.map((d) => entry(d, false)), ...autonomous.map((d) => entry(d, true))];
}

const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');

/** How well an effect matches the query: exact > prefix > substring > subsequence. 0: no match. */
function score(entry: CommandEntry, query: string) {
  const q = norm(query);
  if (!q) return 1;
  let best = 0;
  for (const name of [norm(entry.type), norm(entry.label)]) {
    if (name === q) best = Math.max(best, 100);
    else if (name.startsWith(q)) best = Math.max(best, 80 - name.length / 10);
    else if (name.includes(q)) best = Math.max(best, 50 - name.indexOf(q));
    else {
      let i = 0;
      for (const ch of name) if (ch === q[i]) i++;
      if (i === q.length) best = Math.max(best, 20 - name.length / 10);
    }
  }
  return best;
}

/** Effects matching the query, best first. Empty query: all of them, in catalog order. */
export function search(catalog: readonly CommandEntry[], query: string): CommandEntry[] {
  return catalog
    .map((entry, i) => ({ entry, i, s: score(entry, query) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((r) => r.entry);
}

/** An effect by its exact type or label (ignoring case, spaces and dashes). */
export function resolve(catalog: readonly CommandEntry[], name: string) {
  const q = norm(name);
  return catalog.find((e) => norm(e.type) === q) ?? catalog.find((e) => norm(e.label) === q) ?? null;
}

/** Splits on whitespace, keeping quotes together: text="hello world". */
export function tokenize(input: string): string[] {
  const out: string[] = [];
  const re = /(?:[^\s"]+|"[^"]*"?)+/g;
  for (const m of input.matchAll(re)) out.push(m[0]);
  return out;
}

export interface Parsed {
  /** The text starts with "add". */
  verb: boolean;
  /** What was typed as the effect name (may be partial). */
  name: string;
  /** Something follows the name (at least a space): parameters are being typed. */
  pastName: boolean;
  /** Raw name=value pairs after the name. */
  args: string[];
  /** The token being typed (empty when the input ends in a space). */
  last: string;
}

export function parse(input: string): Parsed {
  const tokens = tokenize(input);
  const endsInSpace = /\s$/.test(input);
  let verb = false;
  if (tokens[0]?.toLowerCase() === 'add' && (tokens.length > 1 || endsInSpace)) {
    verb = true;
    tokens.shift();
  }
  const name = tokens[0] ?? '';
  const pastName = tokens.length > 1 || (tokens.length === 1 && endsInSpace);
  const args = tokens.slice(1);
  const last = endsInSpace ? '' : (tokens[tokens.length - 1] ?? '');
  return { verb, name, pastName, args, last };
}

const unquote = (s: string) => s.replace(/^"/, '').replace(/"$/, '');

/** What the line accepts for a parameter, in short: for the parameter list. */
export function describeParam(spec: ParamSpec): string {
  switch (spec.type) {
    case 'number': {
      const range = spec.min !== undefined && spec.max !== undefined ? ` ${spec.min}–${spec.max}` : spec.min !== undefined ? ` ≥${spec.min}` : spec.max !== undefined ? ` ≤${spec.max}` : '';
      return `number${range}${spec.unit && spec.unit !== 'px' ? ` ${spec.unit}` : spec.unit ? ' px' : ''}`;
    }
    case 'angle': return 'degrees';
    case 'seed': return 'integer';
    case 'boolean': return 'true | false';
    case 'enum': return spec.options.join(' | ');
    case 'text':
    case 'font': return 'text';
    default: return 'inspector only';
  }
}

/** Can it be typed on the line? Colors, points and object references are set in the inspector. */
export const typable = (spec: ParamSpec) => !['color', 'point', 'node', 'nodes'].includes(spec.type);

export function value(name: string, spec: ParamSpec, raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const text = unquote(raw);
  switch (spec.type) {
    case 'number':
    case 'angle':
    case 'seed': {
      const n = Number(text);
      if (text === '' || !Number.isFinite(n)) return { ok: false, error: `${name} needs a number, not "${text}".` };
      if (spec.type === 'seed' && !Number.isInteger(n)) return { ok: false, error: `${name} needs a whole number.` };
      if (spec.type === 'number' && ((spec.min !== undefined && n < spec.min) || (spec.max !== undefined && n > spec.max))) {
        const range = spec.min !== undefined && spec.max !== undefined ? `between ${spec.min} and ${spec.max}` : spec.min !== undefined ? `at least ${spec.min}` : `at most ${spec.max}`;
        return { ok: false, error: `${name} must be ${range}; got ${n}.` };
      }
      return { ok: true, value: n };
    }
    case 'boolean': {
      const t = text.toLowerCase();
      if (['true', 'on', 'yes', '1'].includes(t)) return { ok: true, value: true };
      if (['false', 'off', 'no', '0'].includes(t)) return { ok: true, value: false };
      return { ok: false, error: `${name} is true or false, not "${text}".` };
    }
    case 'enum': {
      const option = spec.options.find((o) => o.toLowerCase() === text.toLowerCase());
      return option ? { ok: true, value: option } : { ok: false, error: `${name} is one of ${spec.options.join(', ')}.` };
    }
    case 'text':
    case 'font':
      return { ok: true, value: text };
    default:
      return { ok: false, error: `${name} can't be typed yet: set it in the inspector after adding.` };
  }
}

export type Command =
  | { ok: true; entry: CommandEntry; params: Record<string, unknown> }
  | { ok: false; error: string };

/** The whole command, ready to run, or the first error with its fix. */
export function compile(catalog: readonly CommandEntry[], input: string): Command {
  const p = parse(input);
  if (!p.name) return { ok: false, error: 'Type an effect name, e.g. twist angle=45.' };
  const entry = resolve(catalog, p.name);
  if (!entry) return { ok: false, error: `No effect called "${p.name}". Tab completes names.` };
  const a = assignments(entry.params, p.args, entry.label, false);
  return a.ok ? { ok: true, entry, params: a.values } : a;
}

export type Assignments = { ok: true; values: Record<string, unknown>; bare: string[] } | { ok: false; error: string };

/**
 * Reads "name=value" tokens against a parameter schema (names ignore case). With `allowBare`, a lone
 * "name" is accepted too and returned in `bare` (the key verb: "key angle").
 */
export function assignments(params: ParamSchema, tokens: readonly string[], label: string, allowBare: boolean): Assignments {
  const values: Record<string, unknown> = {};
  const bare: string[] = [];
  const known = () => Object.keys(params).filter((k) => typable(params[k]!));
  for (const arg of tokens) {
    const eq = arg.indexOf('=');
    if (eq === 0 || (eq < 0 && !allowBare)) return { ok: false, error: `Write parameters as name=value ("${arg}").` };
    const key = eq < 0 ? arg : arg.slice(0, eq);
    const name = Object.keys(params).find((k) => k.toLowerCase() === key.toLowerCase());
    if (!name) {
      const k = known();
      return { ok: false, error: `${label} has no parameter "${key}"${k.length ? `. Try: ${k.slice(0, 6).join(', ')}${k.length > 6 ? '…' : ''}` : ''}.` };
    }
    if (eq < 0) {
      bare.push(name);
      continue;
    }
    const v = value(name, params[name]!, arg.slice(eq + 1));
    if (!v.ok) return v;
    values[name] = v.value;
  }
  return { ok: true, values, bare };
}

/** Tab: completes the effect name or the parameter being typed. Null: nothing to complete. */
export function complete(catalog: readonly CommandEntry[], input: string, highlighted: CommandEntry | null): string | null {
  const p = parse(input);
  const head = p.verb ? 'add ' : '';
  if (!p.pastName) {
    const target = highlighted ?? search(catalog, p.name)[0];
    return target ? `${head}${target.type} ` : null;
  }
  const entry = resolve(catalog, p.name);
  if (!entry || p.last.includes('=')) return null;
  const given = new Set(p.args.map((a) => (a.split('=')[0] ?? '').toLowerCase()));
  const names = Object.keys(entry.params).filter((k) => typable(entry.params[k]!) && !given.has(k.toLowerCase()));
  const match = names.find((k) => k.toLowerCase().startsWith(p.last.toLowerCase()));
  if (!match) return null;
  return `${input.slice(0, input.length - p.last.length)}${match}=`;
}
