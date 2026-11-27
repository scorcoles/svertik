// Wire view: outlines only, a colour per kind of object. Used by the editor's canvas and by both Play hosts.
import type { SceneNode, SceneV1 } from './scene';

export const wirePalette = ['#22d3ee', '#2dd4bf', '#a3e635', '#facc15', '#fb923c', '#fb7185', '#e879f9', '#818cf8'];
export const wireSelectionPalette = ['#ff6b9d', '#ffb454', '#b399ff', '#60a5fa', '#b8ef62'];

/** Only the Range selected in the stack is highlighted; colours never change between frames. */
export function highlightWireRange(svg: SVGSVGElement, rangeId: string | null, ordinal = 0): void {
  svg.style.setProperty('--wire-selection-color', wireSelectionPalette[((ordinal % wireSelectionPalette.length) + wireSelectionPalette.length) % wireSelectionPalette.length]!);
  for (const path of svg.querySelectorAll('[data-svertik-shape]')) {
    const ranges: string[] = JSON.parse(path.getAttribute('data-ranges') ?? '[]');
    if (rangeId && ranges.includes(rangeId)) path.setAttribute('data-wire-selected', '');
    else path.removeAttribute('data-wire-selected');
  }
}

/** One classification for the editor and every player. Material alone does not start physics. */
export function wireBodyKinds(scene: SceneV1): Map<string, 'fixed' | 'mobile'> {
  const kinds = new Map<string, 'fixed' | 'mobile'>();
  const visit = (items: SceneNode[], active = false, inherited?: 'fixed' | 'mobile') => {
    for (const node of items) {
      const simulation = active || node.stack?.some((m) => m.enabled !== false && ['physics', 'gravity'].includes(m.type));
      const rigid = node.stack?.find((m) => m.enabled !== false && m.type === 'rigidbody');
      const kind = rigid ? (rigid.params?.immovable === true ? 'fixed' : 'mobile') : simulation ? inherited ?? 'mobile' : undefined;
      if (simulation && kind) kinds.set(node.id, kind);
      if (node.children?.length) visit(node.children, simulation, kind);
      if (node.kind === 'group' && node.composition) visit(node.composition.scene.objects, simulation, kind);
    }
  };
  visit(scene.objects);
  return kinds;
}

/** Screen-sized hatching shared by the editor and players; a prefix isolates simultaneous SVGs. */
export function updateWirePatterns(svg: SVGSVGElement, on: boolean, prefix = 'wire-hatch'): void {
  let defs = svg.querySelector(':scope > defs[data-wire-hatch]');
  if (!on) { defs?.remove(); return; }
  if (!defs) { defs = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'defs'); defs.setAttribute('data-wire-hatch', ''); svg.append(defs); }
  const matrix = svg.getScreenCTM?.();
  const scale = matrix ? Math.max(Math.hypot(matrix.a, matrix.b), 0.001) : 1;
  const size = 8 / scale, stroke = 1 / scale;
  const markup = [['mobile', '#22d3ee'], ['fixed', '#facc15'], ['selected', 'var(--wire-selection-color, #ff6b9d)']].map(([kind, color]) => `<pattern id="${prefix}-${kind}" patternUnits="userSpaceOnUse" width="${size}" height="${size}" patternTransform="rotate(45)"><path d="M0 0V${size}" fill="none" stroke="${color}" stroke-width="${stroke}"/></pattern>`).join('');
  if (defs.innerHTML !== markup) defs.innerHTML = markup;
}

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
export function wireCSS(scene: SceneV1, root: string, prefix = 'wire-hatch'): string {
  const kinds = wireBodyKinds(scene);
  const perNode = [...wireColors(scene)].map(([id, color]) => {
    const kind = kinds.get(id);
    return `${root}.wire path[data-node=${JSON.stringify(id)}] { --wire-color: ${kind === 'fixed' ? '#facc15' : kind === 'mobile' ? '#22d3ee' : color}; --wire-fill: ${kind ? `url(#${prefix}-${kind})` : 'none'}; }`;
  }).join('\n');
  return `${root}.wire { background: #101216 !important; }\n${root}.wire path[data-svertik-shape] { fill: var(--wire-fill, none) !important; stroke: var(--wire-color, #22d3ee) !important; stroke-width: var(--wire-width, 1px) !important; opacity: 0.78; vector-effect: non-scaling-stroke; pointer-events: none; }\n${perNode}`;
}

/** The invisible interaction copy uses the original paint, never the wire's CSS. */
function wireHits(svg: SVGSVGElement, on: boolean) {
  let layer = svg.querySelector(':scope > g[data-wire-hits]');
  if (!on) { layer?.remove(); return; }
  if (!layer) { layer = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g'); layer.setAttribute('data-wire-hits', ''); layer.setAttribute('opacity', '0'); layer.setAttribute('aria-hidden', 'true'); svg.append(layer); }
  const sync = (source: Element[], parent: Element) => {
    const old = Array.from(parent.children);
    source.forEach((el, i) => {
      let copy = old[i];
      if (!copy || copy.tagName !== el.tagName) { const next = el.cloneNode(false) as Element; if (copy) copy.replaceWith(next); else parent.append(next); copy = next; }
      const attrs = new Set<string>();
      for (const attr of el.attributes) if (!['data-svertik-shape', 'data-svertik-fx'].includes(attr.name)) { attrs.add(attr.name); if (copy.getAttribute(attr.name) !== attr.value) copy.setAttribute(attr.name, attr.value); }
      for (const attr of [...copy.attributes]) if (!attrs.has(attr.name)) copy.removeAttribute(attr.name);
      sync(Array.from(el.children), copy);
    });
    for (let i = source.length; i < old.length; i++) old[i]!.remove();
  };
  sync(Array.from(svg.children).filter((el) => el !== layer && !el.matches('[data-wire-guides]') && !['defs', 'style'].includes(el.tagName.toLowerCase())), layer);
  if (svg.lastElementChild !== layer) svg.append(layer);
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
  style.textContent = wireCSS(scene, `.${cls}`, cls);
  document.head.append(style);
  const refresh = () => { const on = svg.classList.contains('wire'); updateWirePatterns(svg, on, cls); wireHits(svg, on); };
  const observer = new MutationObserver((records) => {
    if (records.some((r) => {
      const el = r.target as Element;
      if (el.closest?.('[data-wire-hits], [data-wire-hatch], [data-wire-guides]')) return false;
      if (r.type === 'childList' && el === svg) return [...r.addedNodes, ...r.removedNodes].some((n) => n.nodeType === 1 && !(n as Element).matches('[data-wire-hits], [data-wire-hatch], [data-wire-guides]'));
      return true;
    })) refresh();
  });
  observer.observe(svg, { childList: true, subtree: true, attributes: true });
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refresh);
  resize?.observe(svg);
  const key = (options.key ?? 'w').toLowerCase();
  const set = (on?: boolean) => {
    const next = on ?? !svg.classList.contains('wire');
    svg.classList.toggle('wire', next);
    refresh();
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
    refresh,
    dispose() { observer.disconnect(); resize?.disconnect(); removeEventListener('keydown', onKey); style.remove(); svg.classList.remove('wire', cls); updateWirePatterns(svg, false); wireHits(svg, false); },
  };
}
