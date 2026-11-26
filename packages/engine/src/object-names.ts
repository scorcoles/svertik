import type { ModifierInstance } from './engine';
import type { SceneNode, SceneV1 } from './scene';

/**
 * A name made usable in formulas: lowercase, no accents, anything else becomes `_` ("Esféra Roja copia" →
 * `esfera_roja_copia`). One that would start with a digit gets a leading `_`; an empty one, `fallback`.
 */
export function systemName(name: string, fallback = 'object'): string {
  const plain = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const out = plain || fallback;
  return /^[0-9]/.test(out) ? `_${out}` : out;
}

/** Where each object and effect of a scene is, for `scene.object.<path>.<value>` (`esfera`, `esfera.grid.each`). */
export interface SceneNames {
  /** Object id → its system name. */
  nodes: Map<string, string>;
  /** Effect id → its path: the object's name, then each effect's (its name, or its type when unnamed). */
  modifiers: Map<string, string>;
}

/**
 * The system names of a scene. Objects (layers and groups too) take theirs from their names; two that come out the
 * same are told apart in layer order (`esfera`, `esfera_2`). Effects are named within their stack, the same way.
 * A nested composition is a scene of its own: its objects are not listed here.
 */
export function sceneNames(scene: SceneV1): SceneNames {
  const nodes = new Map<string, string>();
  const modifiers = new Map<string, string>();
  const taken = new Set<string>();
  const unique = (base: string, used: Set<string>) => {
    let name = base;
    for (let k = 2; used.has(name); k++) name = `${base}_${k}`;
    used.add(name);
    return name;
  };
  const stack = (list: ModifierInstance[] | undefined, prefix: string) => {
    const used = new Set<string>();
    for (const m of list ?? []) {
      const path = `${prefix}.${unique(systemName(m.name ?? '', m.type), used)}`;
      modifiers.set(m.id, path);
      stack(m.children, path);
    }
  };
  const visit = (list: SceneNode[]) => {
    for (const node of list) {
      const name = unique(systemName(node.name ?? '', node.kind), taken);
      nodes.set(node.id, name);
      stack(node.stack, name);
      if (node.children?.length) visit(node.children);
    }
  };
  visit(scene.objects);
  return { nodes, modifiers };
}

/** Every string in the scene that holds formulas: numeric `$expr`s, document variables, and Text `{{…}}` templates. */
function eachFormula(scene: SceneV1, change: (text: string) => string) {
  const isFormula = (v: unknown): v is { $expr: string } => !!v && typeof v === 'object' && typeof (v as { $expr?: unknown }).$expr === 'string';
  // Only a formula that changes is written (the scene may be reactive state, or a reading that must not touch it).
  const apply = (f: { $expr: string }) => { const next = change(f.$expr); if (next !== f.$expr) f.$expr = next; };
  const values = (record: Record<string, unknown> | undefined) => {
    if (!record) return;
    for (const [key, value] of Object.entries(record)) {
      if (isFormula(value)) apply(value);
      else if (Array.isArray(value)) { for (const item of value) if (isFormula(item)) apply(item); }
      else if (key === 'text' && typeof value === 'string' && value.includes('{{')) {
        const next = value.replace(/\{\{([\s\S]*?)\}\}/g, (_whole, inner: string) => `{{${change(inner)}}}`);
        if (next !== value) record[key] = next;
      }
    }
  };
  const stack = (list: ModifierInstance[] | undefined) => { for (const m of list ?? []) { values(m.params); values(m.props); stack(m.children); } };
  values(scene.custom);
  const visit = (list: SceneNode[]) => {
    for (const node of list) {
      if (node.kind === 'shape') values(node.params as Record<string, unknown>);
      values(node.transform as Record<string, unknown> | undefined);
      values(node.props);
      if (isFormula(node.opacity)) apply(node.opacity);
      if (node.kind === 'instance' && node.mouse) values(node.mouse as unknown as Record<string, unknown>);
      if (node.kind === 'group' && node.composition) { values(node.composition.params as Record<string, unknown> | undefined); values(node.composition.modulation?.params as Record<string, unknown> | undefined); }
      stack(node.stack);
      if (node.children?.length) visit(node.children);
    }
  };
  visit(scene.objects);
}

/**
 * Rewrites `scene.object.<path>` references after names change (an object or an effect renamed), so formulas keep
 * pointing at the same thing: `before` and `after` are the scene's names on each side of the change. Edits `scene`
 * in place; returns how many references were rewritten.
 */
export function renameReferences(scene: SceneV1, before: SceneNames, after: SceneNames): number {
  const moves: [string, string][] = [];
  for (const [id, old] of before.nodes) { const now = after.nodes.get(id); if (now && now !== old) moves.push([old, now]); }
  for (const [id, old] of before.modifiers) { const now = after.modifiers.get(id); if (now && now !== old) moves.push([old, now]); }
  if (!moves.length) return 0;
  // Longest first, and all at once (one pass), so `a` → `b` and `b` → `c` don't chain.
  moves.sort((a, b) => b[0].length - a[0].length);
  const table = new Map(moves);
  const pattern = new RegExp(`\\bscene\\s*\\.\\s*object\\s*\\.\\s*(${moves.map(([old]) => old.replace(/\./g, '\\s*\\.\\s*')).join('|')})(?=\\s*\\.)`, 'g');
  let count = 0;
  eachFormula(scene, (text) => text.replace(pattern, (_whole, old: string) => {
    count++;
    return `scene.object.${table.get(old.replace(/\s+/g, '')) ?? old}`;
  }));
  return count;
}

/** Does any formula of the scene read other objects (`scene.object.…`)? */
export function readsObjects(scene: SceneV1): boolean {
  let found = false;
  eachFormula(scene, (text) => { if (!found && /\bscene\s*\.\s*object\s*\./.test(text)) found = true; return text; });
  return found;
}

/**
 * The values `scene.object.<path>` reads, from a scene whose formulas are already evaluated: each object's placement
 * (x, y, scale, rotation), opacity, shape values and `props.<name>`, and each effect's values under its path.
 * `defaults` fills in what the scene leaves unset (as `this.name` does).
 */
export function objectValues(scene: SceneV1, names: SceneNames, defaults?: (owner: 'shape' | 'effect', type: string) => Record<string, unknown> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  const put = (prefix: string, record: Record<string, unknown> | undefined) => {
    for (const [k, v] of Object.entries(record ?? {})) if (typeof v === 'number' && Number.isFinite(v) && !(`${prefix}.${k}` in out)) out[`${prefix}.${k}`] = v;
  };
  const stack = (list: ModifierInstance[] | undefined) => {
    for (const m of list ?? []) {
      const path = names.modifiers.get(m.id);
      if (path) { put(path, m.params); put(path, defaults?.('effect', m.type)); put(`${path}.props`, m.props); }
      stack(m.children);
    }
  };
  const visit = (list: SceneNode[]) => {
    for (const node of list) {
      const path = names.nodes.get(node.id);
      if (path) {
        put(path, { x: 0, y: 0, scale: 1, rotation: 0, ...node.transform });
        out[`${path}.opacity`] = typeof node.opacity === 'number' ? node.opacity : 1;
        if (node.kind === 'shape') { put(path, node.params as Record<string, unknown>); put(path, defaults?.('shape', node.shape)); }
        put(`${path}.props`, node.props);
      }
      stack(node.stack);
      if (node.children?.length) visit(node.children);
    }
  };
  visit(scene.objects);
  return out;
}
