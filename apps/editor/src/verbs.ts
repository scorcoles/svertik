// Command line verbs beyond "add": set, key, select, goto and export. Pure parsing and matching only;
// CommandLine.svelte runs them against the editor. Tested in verbs.test.ts.

import type { ParamSchema } from '@svertik/engine';
import { assignments, tokenize, typable } from './command';

export type Verb = 'add' | 'set' | 'key' | 'select' | 'goto' | 'export';

export const VERBS: readonly { verb: Verb; usage: string; description: string }[] = [
  { verb: 'add', usage: 'add twist angle=45', description: 'Add an effect to the selection. "add" is optional: "twist angle=45" works too.' },
  { verb: 'set', usage: 'set angle=90 radius=0.5', description: 'Change parameters of the selected effect, or of the selected object (x, y, rotation, scale, opacity and its shape).' },
  { verb: 'key', usage: 'key angle  ·  key angle=90', description: 'Put a keyframe at the playhead on each parameter named. With a value, set it first.' },
  { verb: 'select', usage: 'select Comet', description: 'Select an object or an effect by its name.' },
  { verb: 'goto', usage: 'goto 1.5  ·  goto 30f  ·  goto end', description: 'Move the playhead: seconds, frames (30f), start, end or a marker name.' },
  { verb: 'export', usage: 'export png', description: 'Export the document: svg, png, mp4, animsvg, lottie, or json (copies it).' },
];

export const EXPORT_FORMATS = [
  { format: 'svg', label: 'SVG', detail: 'Vector, the current frame' },
  { format: 'png', label: 'PNG (2×)', detail: 'Pixels at twice the size, the current frame' },
  { format: 'mp4', label: 'MP4', detail: 'Video of one cycle' },
  { format: 'animsvg', label: 'Animated SVG', detail: 'One .svg that plays by itself' },
  { format: 'lottie', label: 'Lottie (.json)', detail: 'For Lottie players' },
  { format: 'json', label: 'Copy JSON', detail: 'The scene, to the clipboard' },
] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number]['format'];

/** A verb other than "add" at the start of the line, followed by a space; null otherwise. */
export function splitVerb(input: string): { verb: Exclude<Verb, 'add'>; rest: string } | null {
  const m = /^\s*([a-z]+)\s(.*)$/is.exec(input);
  const word = m?.[1]?.toLowerCase();
  const found = VERBS.find((v) => v.verb === word && v.verb !== 'add');
  return found && m ? { verb: found.verb as Exclude<Verb, 'add'>, rest: m[2] ?? '' } : null;
}

/** Verbs whose name starts with what is typed (for the results list while browsing). */
export const matchVerbs = (query: string) => {
  const q = query.trim().toLowerCase();
  return q ? VERBS.filter((v) => v.verb.startsWith(q)) : [];
};

export type Assign = { ok: true; values: Record<string, unknown>; bare: string[] } | { ok: false; error: string };

/** "set" and "key" arguments against the target's parameters. */
export function parseAssignments(verb: 'set' | 'key', rest: string, params: ParamSchema, label: string): Assign {
  const tokens = tokenize(rest);
  if (!tokens.length) return { ok: false, error: verb === 'set' ? 'Name a parameter and its value, e.g. set angle=90.' : 'Name the parameters to key, e.g. key angle.' };
  const a = assignments(params, tokens, label, verb === 'key');
  if (!a.ok) return a;
  for (const name of [...Object.keys(a.values), ...a.bare]) {
    if (!typable(params[name]!)) return { ok: false, error: `${name} can't be typed yet: set it in the inspector.` };
  }
  return a;
}

/** "goto" argument: seconds ("1.5" or "1.5s"), frames ("30f"), start, end or a marker name. */
export function parseTime(text: string, ctx: { fps: number; duration: number; markers: readonly { name: string; t: number }[] }): { ok: true; t: number } | { ok: false; error: string } {
  const raw = text.trim();
  const q = raw.toLowerCase();
  if (!q) return { ok: false, error: 'Say where: goto 1.5, goto 30f, goto end or a marker name.' };
  if (q === 'start') return { ok: true, t: 0 };
  if (q === 'end') return { ok: true, t: ctx.duration };
  const seconds = /^(\d+(?:\.\d+)?|\.\d+)s?$/.exec(q);
  if (seconds) return { ok: true, t: Math.min(ctx.duration, Number(seconds[1])) };
  const frames = /^(\d+)f$/.exec(q);
  if (frames) return { ok: true, t: Math.min(ctx.duration, Number(frames[1]) / ctx.fps) };
  const marker = ctx.markers.find((m) => m.name.toLowerCase() === q);
  if (marker) return { ok: true, t: marker.t };
  return { ok: false, error: `No marker called "${raw}". Use seconds (1.5), frames (30f), start or end.` };
}

/** Names that match what is typed: exact first, then prefix, then substring (ignoring case). */
export function matchNames<T extends { label: string }>(items: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  const rank = (label: string) => {
    const l = label.toLowerCase();
    return l === q ? 3 : l.startsWith(q) ? 2 : l.includes(q) ? 1 : 0;
  };
  return items
    .map((item, i) => ({ item, i, r: rank(item.label) }))
    .filter((x) => x.r > 0)
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .map((x) => x.item);
}

/** Tab for "set"/"key": completes the parameter being typed ("set ang" → "set angle="). */
export function completeParam(verb: 'set' | 'key', input: string, params: ParamSchema): string | null {
  if (/\s$/.test(input)) return null;
  const tokens = tokenize(input);
  const last = tokens.length > 1 ? tokens[tokens.length - 1]! : '';
  if (!last || last.includes('=')) return null;
  const given = new Set(tokens.slice(1, -1).map((t) => (t.split('=')[0] ?? '').toLowerCase()));
  const match = Object.keys(params).find((k) => typable(params[k]!) && !given.has(k.toLowerCase()) && k.toLowerCase().startsWith(last.toLowerCase()));
  return match ? `${input.slice(0, input.length - last.length)}${match}${verb === 'set' ? '=' : ''}` : null;
}
