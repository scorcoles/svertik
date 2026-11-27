// toCode: a scene written as svertikJS, the editor's JS tab. Running the code gives the same scene back
// (`runCode`), except for ids nothing points at, which become readable, and parameters at their default,
// which are left out. Printing that scene again gives the same code. What svertikJS has no words for yet
// goes out as `raw({ … })`, unchanged.
import type { CustomVariable, Keyframe, ModifierInstance, SceneNode, SceneV1, Track } from '@svertik/engine';
import { builtins, isNumericExpression, isRangedVariable, resolveParams, shapeRegistry, systemName, type ParamSpec } from '@svertik/engine';
import { EFFECT_METHODS } from './generated';
import { methodName } from './generate-source';
import { fallbackOf } from './values';

const effectDefs = new Map((builtins as unknown as { type: string; kind: string; label: string; params?: Record<string, ParamSpec> }[]).map((d) => [d.type, d]));
const methodOf = new Map(Object.entries(EFFECT_METHODS).map(([method, type]) => [type as string, method]));
const shapeFactory = (shape: string) => {
  const def = shapeRegistry.get(shape) as { type: string; label: string } | undefined;
  return def ? methodName(def.type, def.label) : null;
};

const RESERVED = new Set('break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static enum await implements package protected interface private public arguments eval undefined NaN Infinity'.split(' '));
const IDENT = /^[A-Za-z_$][\w$]*$/;
const round = (n: number) => (Number.isInteger(n) ? n : Math.round(n * 1e6) / 1e6);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const NODE_KEYS: Record<string, string[]> = {
  shape: ['shape', 'params'],
  group: ['children', 'layer', 'composition'],
  instance: ['of', 'mouse'],
  object: ['source'],
};
const COMMON_KEYS = new Set(['kind', 'id', 'name', 'stack', 'transform', 'opacity', 'blend', 'visible', 'locked', 'props']);
const SCENE_KEYS = new Set(['version', 'document', 'background', 'notes', 'seedGenerator', 'seedEvery', 'seedOnLoad', 'fullViewport', 'physicsBounds', 'clipToDocument', 'custom', 'objects', 'animation', 'interactions']);

/** svertikJS code for a scene: imports, its SVGs and variables, and `export default scene(…)`. */
export function toCode(scene: SceneV1): string {
  const p = new Printer();
  const body = p.scene(scene, '', true);
  const imports = [...p.imports].sort((a, b) => (a === 'scene' ? -1 : b === 'scene' ? 1 : a.localeCompare(b)));
  return [
    `import { ${imports.join(', ')} } from '@svertik/js';`,
    '',
    ...(p.consts.length ? [...p.consts, ''] : []),
    `export default ${body};`,
    '',
  ].join('\n');
}

class Printer {
  imports = new Set<string>(['scene']);
  consts: string[] = [];
  #names = new Set<string>();

  #free(base: string) {
    let name = IDENT.test(base) && !RESERVED.has(base) ? base : `_${base.replace(/[^\w$]/g, '_')}`;
    const root = name;
    for (let i = 2; this.#names.has(name) || this.imports.has(name) || name in EFFECT_METHODS; i++) name = `${root}${i}`;
    this.#names.add(name);
    return name;
  }
  #use(name: string) {
    this.imports.add(name);
    return name;
  }

  /** `scene({ … }, …objects)`. Top level: variables as constants; nested (compositions): inline. */
  scene(s: SceneV1, indent: string, top: boolean): string {
    const ctx = new Scope(s);
    const opts: string[] = [];
    const extra: Record<string, unknown> = {};
    const doc = s.document;
    if (doc && doc.x === undefined && doc.y === undefined) opts.push(`width: ${doc.width}`, `height: ${doc.height}`);
    else if (doc !== undefined) extra.document = doc;
    if (s.background) opts.push(`background: ${str(s.background)}`);
    const anim = s.animation;
    if (anim) {
      opts.push(`duration: ${anim.duration}`);
      if (anim.fps) opts.push(`fps: ${anim.fps}`);
      const forever = anim.tracks.some((t) => t.repeat === 0);
      if (anim.infinite) opts.push('infinite: true');
      else if (anim.loop) opts.push('loop: true');
      else if (forever) opts.push('loop: false');
      if (anim.autoplay === false) opts.push('autoplay: false');
      if (anim.markers?.length) opts.push(`markers: ${this.lit(anim.markers, ctx, indent, true)}`);
    }
    if (s.seedGenerator !== undefined) opts.push(`seed: ${s.seedGenerator}`);
    if (s.seedEvery) opts.push(`seedEvery: ${s.seedEvery}`);
    if (s.seedOnLoad) opts.push('seedOnLoad: true');
    if (s.fullViewport) opts.push(`fit: ${this.lit(s.fullViewport, ctx, indent)}`);
    if (s.physicsBounds) opts.push('walls: true');
    if (s.clipToDocument) opts.push('clip: true');
    if (s.notes) opts.push(`notes: ${str(s.notes)}`);
    const vars = Object.entries(s.custom ?? {}).map(([name, v]) => this.variable(name, v, ctx, top));
    if (vars.length) opts.push(`custom: [${vars.join(', ')}]`);
    if (s.interactions?.length) opts.push(`interactions: ${this.lit(s.interactions, ctx, indent, true)}`);
    for (const [k, v] of Object.entries(s)) if (!SCENE_KEYS.has(k) && v !== undefined) extra[k] = v;
    if (Object.keys(extra).length) opts.push(`extra: ${this.lit(extra, ctx, indent, true)}`);
    const inner = indent + '  ';
    const objects = s.objects.map((n) => `${inner}${this.node(n, ctx, inner)},`);
    const head = `${this.#use('scene')}({ ${opts.join(', ')} }`;
    return objects.length ? `${head},\n${objects.join('\n')}\n${indent})` : `${head})`;
  }

  variable(name: string, v: CustomVariable, ctx: Scope, top: boolean): string {
    let call: string;
    if (typeof v === 'number') call = `${this.#use('custom')}(${str(name)}, ${v})`;
    else if (isRangedVariable(v)) {
      const o: Record<string, unknown> = {};
      for (const k of ['label', 'min', 'max', 'step', 'unit'] as const) if (v[k] !== undefined) o[k] = v[k];
      call = `${this.#use('expose')}(${str(name)}, ${v.value}${Object.keys(o).length ? `, ${this.lit(o, ctx, '')}` : ''})`;
    } else call = `${this.#use('custom')}(${str(name)}, ${this.formula(v as { $expr: string; fallback: number }, ctx, ctx.numbers[name])})`;
    if (!top) return call;
    const local = this.#free(name);
    this.consts.push(`const ${local} = ${call};`);
    return local;
  }

  /** ``fx`…` ``, with the fallback written only when it isn't the formula's value at time 0. */
  formula(e: { $expr: string; fallback?: number }, ctx: Scope, computed = fallbackOf(e.$expr, ctx.numbers, ctx.seed)): string {
    const text = '`' + e.$expr.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
    const fx = this.#use('fx');
    return e.fallback === undefined || Math.abs(e.fallback - computed) < 1e-9 ? `${fx}${text}` : `${fx}({ fallback: ${round(e.fallback)} })${text}`;
  }

  /** A value: formulas as `fx` (not in `plain` JSON, kept as it is), the rest as a literal (one line while it fits). */
  lit(v: unknown, ctx: Scope, indent: string, plain = false): string {
    if (!plain && isNumericExpression(v)) return this.formula(v, ctx);
    if (typeof v === 'string') return str(v);
    // Numbers exactly as they are: rounding moves a drawing by a hair.
    if (typeof v === 'number') return String(v);
    if (Array.isArray(v)) {
      const items = v.map((x) => this.lit(x, ctx, indent + '  ', plain));
      const one = `[${items.join(', ')}]`;
      return one.length <= 100 && !one.includes('\n') ? one : `[\n${items.map((x) => `${indent}  ${x},`).join('\n')}\n${indent}]`;
    }
    if (v && typeof v === 'object') {
      const entries = Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => `${IDENT.test(k) ? k : str(k)}: ${this.lit(x, ctx, indent + '  ', plain)}`);
      if (!entries.length) return '{}';
      const one = `{ ${entries.join(', ')} }`;
      return one.length <= 100 && !one.includes('\n') ? one : `{\n${entries.map((x) => `${indent}  ${x},`).join('\n')}\n${indent}}`;
    }
    return JSON.stringify(v) ?? 'undefined';
  }

  node(n: SceneNode, ctx: Scope, indent: string): string {
    const keys = NODE_KEYS[n.kind];
    const plain = keys && Object.keys(n).every((k) => COMMON_KEYS.has(k) || keys.includes(k))
      && !(n.kind === 'object' && (!n.source || n.href || n.packed))
      && !(n.kind === 'group' && n.composition && n.children.length)
      && !(n.kind === 'shape' && !shapeFactory(n.shape));
    if (!plain) return this.rawNode(n, ctx, indent);

    let head: string;
    const name = str(n.name);
    if (n.kind === 'shape') {
      const params = this.params(n.params, (shapeRegistry.get(n.shape) as { params?: Record<string, ParamSpec> }).params ?? {}, true);
      const fn = this.#use(shapeFactory(n.shape)!);
      head = `${fn}(${name}${Object.keys(params).length ? `, ${this.lit(params, ctx, indent)}` : ''})`;
    } else if (n.kind === 'object') {
      const local = this.#free(svgName(n.name));
      this.consts.push(`const ${local} = ${'`' + n.source.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`'};`);
      head = `${this.#use('svg')}(${name}, ${local})`;
    } else if (n.kind === 'instance') {
      head = `${this.#use('instance')}(${name}, ${this.lit({ of: n.of, ...(n.mouse ? { mouse: n.mouse } : {}) }, ctx, indent)})`;
    } else if (n.kind === 'group' && n.composition) {
      const c = n.composition;
      const args = [name, new Printer().sceneInto(this, c.scene, indent)];
      if (c.params || c.modulation) args.push(this.lit(c.params ?? {}, ctx, indent));
      if (c.modulation) args.push(this.lit(c.modulation, ctx, indent));
      head = `${this.#use('composition')}(${args.join(', ')})`;
    } else {
      const g = n as Extract<SceneNode, { kind: 'group' }>;
      const inner = indent + '  ';
      const kids = g.children.map((c) => `${inner}${this.node(c, ctx, inner)},`);
      const fn = this.#use(g.layer ? 'layer' : 'group');
      head = kids.length ? `${fn}(${name},\n${kids.join('\n')}\n${indent})` : `${fn}(${name})`;
    }

    const lines: string[] = [];
    const set: Record<string, unknown> = { ...(n.transform ?? {}) };
    for (const k of ['opacity', 'visible', 'blend', 'locked', 'props'] as const) if (n[k] !== undefined) set[k] = n[k];
    if (ctx.keepId(n.id) && n.id !== systemName(n.name, n.kind === 'shape' ? n.shape : n.kind)) set.id = n.id;
    if (Object.keys(set).length) lines.push(`.set(${this.lit(set, ctx, indent + '  ')})`);
    for (const m of n.stack ?? []) lines.push(this.effectCall(m, ctx, indent + '  ', true));
    lines.push(...this.tweens(ctx.tracksOf(n.id, null), ctx, indent + '  '));
    return lines.length ? `${head}\n${lines.map((l) => `${indent}  ${l}`).join('\n')}` : head;
  }

  /** A composition's scene, printed with this printer's imports (it stays inline). */
  sceneInto(outer: Printer, s: SceneV1, indent: string): string {
    this.imports = outer.imports;
    this.#names = outer.#names;
    this.consts = outer.consts;
    return this.scene(s, indent, false);
  }

  rawNode(n: SceneNode, ctx: Scope, indent: string): string {
    const tracks = ctx.tracksOf(n.id, 'any').map((t) => `.keys(${str(t.param)}, ${this.lit(t.keys, ctx, indent + '  ')}, ${this.lit({ on: t.on, ...(t.modifier ? { modifier: t.modifier } : {}), ...(t.repeat !== undefined ? { repeat: t.repeat } : {}), ...(t.every !== undefined ? { every: t.every } : {}) }, ctx, indent + '  ')})`);
    const head = `${this.#use('raw')}(${this.lit(n, ctx, indent, true)})`;
    return tracks.length ? `${head}\n${tracks.map((l) => `${indent}  ${l}`).join('\n')}` : head;
  }

  /** Parameters without the ones at their default; `fill: '#fff'` for a fill that is on with its colour. */
  params(given: Record<string, unknown> | undefined, specs: Record<string, ParamSpec>, style: boolean): Record<string, unknown> {
    const defaults = resolveParams(specs as never) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(given ?? {})) {
      const spec = specs[k] as (ParamSpec & { defaultExpr?: string }) | undefined;
      if (spec && !spec.defaultExpr && same(v, defaults[k])) continue;
      out[k] = v;
    }
    if (!style) return out;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(out)) {
      const key = k === 'fillColor' ? 'fill' : k === 'strokeColor' ? 'stroke' : null;
      const on = key ? ((given ?? {})[key] ?? defaults[key]) : null;
      // `fill: '#fff'` turns it on and sets the colour at once.
      if (key && on === true && typeof v === 'string') result[key] = v;
      else if ((k === 'fill' || k === 'stroke') && v === true && typeof out[`${k}Color`] === 'string') continue;
      else result[k] = v;
    }
    return result;
  }

  /** `.twist('Name', { … }, …children, (e) => e.fromTo(…))`, or a free-standing `twist(…)` when nested. */
  effectCall(m: ModifierInstance, ctx: Scope, indent: string, chained: boolean): string {
    const def = effectDefs.get(m.type);
    const method = methodOf.get(m.type);
    const args: string[] = [];
    if (m.name) args.push(str(m.name));
    let params = def ? this.params(m.params, def.params ?? {}, false) : { ...(m.params ?? {}) };
    let children = m.children ?? [];
    // Each with a plain Shape inside: its values go with Each's own.
    const only = children[0];
    if (m.type === 'each' && children.length === 1 && only!.type === 'shapevalues' && !only!.name && only!.enabled !== false && !only!.props && !only!.children?.length
      && !ctx.keepModifierId(only!.id) && !ctx.tracksOf(ctx.ownerOf(only!.id), only!.id).length
      && Object.keys(only!.params ?? {}).every((k) => !(k in (def?.params ?? {})))) {
      params = { ...params, ...only!.params };
      children = [];
    }
    if (Object.keys(params).length || children.length) args.push(this.lit(params, ctx, indent));
    for (const c of children) args.push(this.effectCall(c, ctx, indent + '  ', false));
    const after: string[] = [];
    if (m.enabled === false) after.push('.off()');
    if (ctx.keepModifierId(m.id) && !m.id.endsWith(`_${m.type}`)) after.push(`.withId(${str(m.id)})`);
    if (m.props) after.push(`.withProps(${this.lit(m.props, ctx, indent)})`);
    const tweens = this.tweens(ctx.tracksOf(ctx.ownerOf(m.id), m.id), ctx, indent + '  ');
    after.push(...tweens);
    if (!method) {
      const head = `${chained ? '.effect' : this.#use('effect')}(${[str(m.type), ...args].join(', ')})`;
      return after.length && chained ? `${head.replace(/\)$/, '')}, (e) => e${after.join('')})` : `${head}${after.join('')}`;
    }
    if (chained) {
      if (after.length) args.push(`(e) => e${after.join('')}`);
      return `.${method}(${args.join(', ')})`;
    }
    return `${this.#use(method)}(${args.join(', ')})${after.join('')}`;
  }

  /** Two-key tracks as `.fromTo` (grouped when they share their timing); the rest as `.keys`. */
  tweens(tracks: Track[], ctx: Scope, indent: string): string[] {
    const out: string[] = [];
    const groups = new Map<string, { from: Record<string, unknown>; to: Record<string, unknown>; timing: Record<string, unknown> }>();
    for (const t of tracks) {
      const tween = asTween(t);
      if (!tween) {
        const opts: Record<string, unknown> = {};
        if (t.repeat !== undefined) opts.repeat = t.repeat;
        if (t.every !== undefined) opts.every = t.every;
        if (t.on === 'composition') opts.on = 'composition';
        out.push(`.keys(${str(t.param)}, ${this.lit(t.keys, ctx, indent)}${Object.keys(opts).length ? `, ${this.lit(opts, ctx, indent)}` : ''})`);
        continue;
      }
      const key = JSON.stringify(tween.timing);
      const g = groups.get(key) ?? { from: {}, to: {}, timing: tween.timing };
      g.from[t.param] = tween.a;
      g.to[t.param] = tween.b;
      groups.set(key, g);
    }
    // In order of when they start (then by property): the same code whatever order the tracks were in.
    const sorted = [...groups.values()].sort((a, b) => Number(a.timing.delay ?? 0) - Number(b.timing.delay ?? 0) || Object.keys(a.from)[0]!.localeCompare(Object.keys(b.from)[0]!));
    for (const g of sorted) g.from = Object.fromEntries(Object.entries(g.from).sort(([a], [b]) => a.localeCompare(b)));
    out.sort();
    return [...sorted.map((g) => `.fromTo(${this.lit(g.from, ctx, indent)}, ${this.lit({ ...Object.fromEntries(Object.keys(g.from).map((k) => [k, g.to[k]])), ...g.timing }, ctx, indent)})`), ...out];
  }
}

/** A two-key track as a tween: values, and duration, delay, ease, repeat and repeatDelay. */
function asTween(t: Track): { a: unknown; b: unknown; timing: Record<string, unknown> } | null {
  if (t.on === 'composition' || t.param === 'enabled' || t.keys.length !== 2) return null;
  const [k0, k1] = t.keys as [Keyframe, Keyframe];
  if (k1.t <= k0.t || [k0.value, k1.value].some((v) => v !== null && typeof v === 'object')) return null;
  const lap = k1.t - k0.t;
  const timing: Record<string, unknown> = { duration: round(lap) };
  if (k0.t) timing.delay = round(k0.t);
  timing.ease = k0.ease ?? 'ease-in-out';
  if (t.repeat !== undefined && t.repeat !== 1) timing.repeat = t.repeat === 0 ? -1 : t.repeat - 1;
  if (t.every !== undefined) {
    if (t.repeat === 1 || t.repeat === undefined || t.every < lap) return null;
    if (Math.abs(t.every - lap) > 1e-9) timing.repeatDelay = round(t.every - lap);
  }
  return { a: k0.value, b: k1.value, timing };
}

/** What a scene's printing needs to know: its variables' values, which ids are pointed at, its tracks. */
class Scope {
  numbers: Record<string, number> = {};
  seed: number;
  #refs: string;
  #owner = new Map<string, string>();
  #tracks: Track[];
  #taken = new Set<string>();
  constructor(readonly s: SceneV1) {
    this.seed = s.seedGenerator ?? 1;
    const custom = s.custom ?? {};
    for (const [k, v] of Object.entries(custom)) if (typeof v === 'number') this.numbers[k] = v; else if (isRangedVariable(v)) this.numbers[k] = v.value;
    for (let pass = 0; pass <= Object.keys(custom).length; pass++) {
      let changed = false;
      for (const [k, v] of Object.entries(custom)) {
        if (!isNumericExpression(v)) continue;
        const n = fallbackOf(v.$expr, this.numbers, this.seed);
        if (this.numbers[k] !== n) { this.numbers[k] = n; changed = true; }
      }
      if (!changed) break;
    }
    // Everything that may point at an id, without the ids themselves, the names, the tracks (printed with
    // their objects) and nested compositions (their own scope).
    const strip = (n: SceneNode): unknown => {
      const { id: _id, name: _name, stack, children, ...rest } = n as SceneNode & { children?: SceneNode[] };
      if ('composition' in rest && rest.composition) rest.composition = { ...rest.composition, scene: { version: 1, objects: [] } };
      return { ...rest, stack: (stack ?? []).map(stripModifier), children: children?.map(strip) };
    };
    const stripModifier = (m: ModifierInstance): unknown => {
      const { id: _id, children, ...rest } = m;
      return { ...rest, children: children?.map(stripModifier) };
    };
    this.#refs = JSON.stringify({ ...s, objects: s.objects.map(strip), animation: s.animation ? { ...s.animation, tracks: [] } : undefined });
    const walk = (list: SceneNode[]) => list.forEach((n) => {
      const mods = (ms: ModifierInstance[]) => ms.forEach((m) => { this.#owner.set(m.id, n.id); mods(m.children ?? []); });
      mods(n.stack ?? []);
      if (n.children) walk(n.children);
    });
    walk(s.objects);
    this.#tracks = s.animation?.tracks ?? [];
  }
  /** As a string value (not a key), or quoted inside a formula (`children["id"]`). */
  #pointedAt(id: string) {
    const esc = JSON.stringify(id).slice(1, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`"${esc}"(?!:)|\\\\"${esc}\\\\"`).test(this.#refs);
  }
  /** Keep an object's id when something points at it (otherwise a readable one comes from its name). */
  keepId(id: string) { return this.#pointedAt(id); }
  keepModifierId(id: string) { return this.#pointedAt(id); }
  ownerOf(modifierId: string) { return this.#owner.get(modifierId) ?? ''; }
  /** The tracks of an object (`modifier` null) or of one of its effects; `'any'`: all of the object's. */
  tracksOf(node: string, modifier: string | null | 'any'): Track[] {
    return this.#tracks.filter((t) => {
      if (t.node !== node || this.#taken.has(t.id)) return false;
      const mine = modifier === 'any' || (modifier === null ? t.on !== 'modifier' : t.on === 'modifier' && t.modifier === modifier);
      if (mine) this.#taken.add(t.id);
      return mine;
    });
  }
}

const str = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
/** "Star Logo.svg" → starLogo. */
const svgName = (name: string) => {
  const words = name.replace(/\.svg$/i, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  const base = words.map((w, i) => (i ? w[0]!.toUpperCase() + w.slice(1) : w.toLowerCase())).join('') || 'drawing';
  return /^\d/.test(base) ? `svg${base}` : base;
};
