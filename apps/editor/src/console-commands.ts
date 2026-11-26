import { t } from '@svertik/ui/i18n';
import { sceneNames, type SceneV1 } from '@svertik/engine';
import { consoleState, evaluateInScene, formatValue, type ConsoleResult } from './console.svelte';
import type { Editor } from './editor.svelte';

/**
 * Console commands: calls that act on the editor instead of giving a value (`play()`, `goto(2)`, `select(esfera)`).
 * Their names don't clash with the formula functions, so `step(1, 2)` is still a formula.
 */
interface CommandDef { name: string; args: string; /** Read when shown, so it follows the language. */ about: () => string; run: (args: string[], editor: Editor) => ConsoleResult }

/** Splits `a, f(b, c), "d"` at its top-level commas. */
function splitArgs(source: string): string[] {
  const out: string[] = [];
  let depth = 0, quote = '', start = 0;
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (quote) { if (c === quote && source[i - 1] !== '\\') quote = ''; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) { out.push(source.slice(start, i)); start = i + 1; }
  }
  const last = source.slice(start);
  if (out.length || last.trim()) out.push(last);
  return out.map((a) => a.trim());
}
/** A name argument: quotes and a leading `scene.object.` are optional. */
const nameOf = (raw: string | undefined) => (raw ?? '').replace(/^["']|["']$/g, '').replace(/^scene\s*\.\s*object\s*\./, '').replace(/\s+/g, '');
const number = (raw: string | undefined, editor: Editor): { value?: number; error?: string } => {
  if (raw === undefined || raw === '') return { error: t('Missing a value.') };
  return evaluateInScene(raw, editor.scene, editor.time, editor.selected);
};
const ok = (message: string): ConsoleResult => ({ message });
const fail = (error: string): ConsoleResult => ({ error });

/** Where a system path points: an object or an effect, by its id. */
function find(scene: SceneV1, path: string): { kind: 'node' | 'modifier'; id: string } | null {
  const names = sceneNames(scene);
  for (const [id, p] of names.nodes) if (p === path) return { kind: 'node', id };
  for (const [id, p] of names.modifiers) if (p === path) return { kind: 'modifier', id };
  return null;
}
const NODE_VALUES = new Set(['x', 'y', 'scale', 'rotation', 'opacity']);

export const COMMANDS: CommandDef[] = [
  { name: 'play', args: '', about: () => t('Play the timeline'), run: (_a, e) => { if (!e.playing) e.togglePlayback(); return ok(t('Playing')); } },
  { name: 'pause', args: '', about: () => t('Pause where it is'), run: (_a, e) => { e.playing = false; return ok(t('Paused at {time} s', { time: formatValue(e.time) })); } },
  { name: 'stop', args: '', about: () => t('Pause and go back to the start'), run: (_a, e) => { e.playing = false; e.setTime(0); return ok(t('Stopped at 0 s')); } },
  { name: 'goto', args: 'seconds', about: () => t('Move the playhead to that time'), run: ([time], e) => {
    const n = number(time, e);
    if (n.error) return fail(n.error);
    e.setTime(n.value!);
    return ok(t('At {time} s', { time: formatValue(e.time) }));
  } },
  { name: 'frame', args: 'n', about: () => t('Move the playhead to that frame'), run: ([f], e) => {
    const n = number(f, e);
    if (n.error) return fail(n.error);
    e.setTime(Math.round(n.value!) / (e.animation?.fps ?? 30));
    return ok(t('Frame {frame} · {time} s', { frame: Math.round(n.value!), time: formatValue(e.time) }));
  } },
  { name: 'select', args: 'name', about: () => t('Select an object or effect by its system name (empty: nothing)'), run: ([raw], e) => {
    const path = nameOf(raw);
    if (!path) { e.selected = null; return ok(t('Nothing selected')); }
    const at = e.scene && find(e.scene, path);
    if (!at) return fail(t('No object or effect “{name}”. objects() lists them.', { name: path }));
    e.selected = at.id;
    return ok(t('Selected {name}', { name: path }));
  } },
  { name: 'set', args: 'name.value, number', about: () => t('Set a value of any object or effect: set(esfera.radius, 120)'), run: ([target, raw], e) => {
    const path = nameOf(target);
    const dot = path.lastIndexOf('.');
    if (!e.scene || dot < 0) return fail(t('Use set(object.value, number), e.g. set(esfera.x, 100).'));
    const owner = find(e.scene, path.slice(0, dot)), key = path.slice(dot + 1);
    if (!owner) return fail(t('No object or effect “{name}”. objects() lists them.', { name: path.slice(0, dot) }));
    const n = number(raw, e);
    if (n.error) return fail(n.error);
    if (owner.kind === 'modifier') e.setModifierParam(owner.id, key, n.value);
    else if (NODE_VALUES.has(key)) e.setNode(owner.id, key as 'x', n.value, true);
    else e.setShapeParam(owner.id, key, n.value);
    return ok(`${path} = ${formatValue(n.value!)}`);
  } },
  { name: 'seed', args: 'n?', about: () => t('Set the document seed (none: a new random one)'), run: ([raw], e) => {
    const n = raw ? number(raw, e) : { value: Math.floor(Math.random() * 100000) };
    if (n.error) return fail(n.error);
    e.setSeedGenerator(Math.round(n.value!));
    return ok(t('Seed {seed}', { seed: e.seedGenerator }));
  } },
  { name: 'undo', args: '', about: () => t('Undo the last change'), run: (_a, e) => { e.undo(); return ok(t('Undone')); } },
  { name: 'redo', args: '', about: () => t('Redo'), run: (_a, e) => { e.redo(); return ok(t('Redone')); } },
  { name: 'objects', args: '', about: () => t('List the system names of the objects and effects'), run: (_a, e) => {
    if (!e.scene) return fail(t('Open a scene first.'));
    const names = sceneNames(e.scene);
    return ok([...names.nodes.values(), ...names.modifiers.values()].sort().join('\n') || t('No objects'));
  } },
  { name: 'pin', args: 'expression', about: () => t('Keep an expression on top, live'), run: (args) => {
    const source = args.join(', ');
    if (!source) return fail(t('Use pin(expression), e.g. pin(scene.time).'));
    consoleState.pin(source);
    return ok(t('Pinned {expression}', { expression: source }));
  } },
  { name: 'unpin', args: 'expression?', about: () => t('Remove a pinned expression (none: all)'), run: (args) => {
    const source = args.join(', ');
    if (source) consoleState.unpin(source); else for (const p of [...consoleState.pinned]) consoleState.unpin(p);
    return ok(source ? t('Unpinned {expression}', { expression: source }) : t('Unpinned all'));
  } },
  { name: 'clear', args: '', about: () => t('Clear the console'), run: () => ({}) },
  { name: 'help', args: '', about: () => t('List the commands'), run: () => ok(COMMANDS.map((c) => `${c.name}(${c.args})`.padEnd(26) + c.about()).join('\n')) },
];
const BY_NAME = new Map(COMMANDS.map((c) => [c.name, c]));

/** A console line that is a command: its name and arguments, or null (then it is a formula). */
export function commandOf(input: string): { def: CommandDef; args: string[] } | null {
  const m = /^\s*([A-Za-z_]\w*)\s*\(([\s\S]*)\)\s*;?\s*$/.exec(input);
  const def = m && BY_NAME.get(m[1]!);
  return def ? { def, args: splitArgs(m![2]!) } : null;
}
