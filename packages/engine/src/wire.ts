// Wire view: outlines only, a colour per kind of object. Used by the editor's canvas and by both Play hosts.
import type { SceneNode, SceneV1 } from './scene';

export const wirePalette = ['#22d3ee', '#2dd4bf', '#a3e635', '#facc15', '#fb923c', '#fb7185', '#e879f9', '#818cf8'];

/** The wire colour of every node of the scene (by its kind, or its first effect), nested scenes included. */
export function wireColors(scene: SceneV1): Map<string, string> {
  const colors = new Map<string, string>();
  const visit = (items: SceneNode[]) => {
    for (const node of items) {
      const key = node.kind === 'object' ? 'svg' : node.kind === 'group' && node.composition ? 'composition' : node.kind === 'shape' ? node.shape : node.kind;
      const category = node.stack?.[0]?.type ? `effect:${node.stack[0].type}` : key;
      let hash = 0;
      for (const char of category) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
      colors.set(node.id, wirePalette[hash % wirePalette.length]!);
      if (node.children?.length) visit(node.children);
      if (node.kind === 'group' && node.composition) visit(node.composition.scene.objects);
    }
  };
  visit(scene.objects);
  return colors;
}

/**
 * CSS that turns a rendered scene into wires under `root` (a selector) when it also has the `wire` class.
 * Stylesheet rules, not per-element styles, so they survive the player redrawing every frame.
 */
export function wireCSS(scene: SceneV1, root: string): string {
  const perNode = [...wireColors(scene)].map(([id, color]) => `${root}.wire path[data-node=${JSON.stringify(id)}] { --wire-color: ${color}; }`).join('\n');
  return `${root}.wire { background: #101216; }\n${root}.wire path[data-svertik-shape] { fill: none !important; stroke: var(--wire-color, #22d3ee) !important; stroke-width: 1px !important; opacity: 0.78; vector-effect: non-scaling-stroke; }\n${perNode}`;
}

export interface WireOptions {
  /** The key that toggles it (any case, no modifiers). `'w'` by default. */
  key?: string;
  /** Start in Wire. */
  initial?: boolean;
  onChange?: (on: boolean) => void;
}

let wireSerial = 0;

/** Lets the viewer toggle Wire on a playing scene with a key. Returns the toggle and a way to undo it all. */
export function installWire(svg: SVGSVGElement, scene: SceneV1, options: WireOptions = {}) {
  const cls = `svertik-wire-${++wireSerial}`;
  svg.classList.add(cls);
  const style = document.createElement('style');
  style.textContent = wireCSS(scene, `.${cls}`);
  document.head.append(style);
  const key = (options.key ?? 'w').toLowerCase();
  const set = (on?: boolean) => {
    const next = on ?? !svg.classList.contains('wire');
    svg.classList.toggle('wire', next);
    options.onChange?.(next);
    return next;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() !== key || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as Element | null;
    if (t?.closest?.('input, textarea, select, [contenteditable]')) return;
    set();
  };
  addEventListener('keydown', onKey);
  if (options.initial) set(true);
  return {
    toggle: set,
    dispose() { removeEventListener('keydown', onKey); style.remove(); svg.classList.remove('wire', cls); },
  };
}
