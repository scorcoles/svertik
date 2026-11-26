// Effect guides (Bones' chain): what an effect draws over the canvas to show how it is set up, in document
// coordinates, from an evaluated document. The editor and the players draw them in Wire.
import { apply } from './matrix';
import { resolveParams, type ModifierDef } from './modifier';
import type { DocumentResult, NodeInfo } from './document';
import type { SceneNode, SceneV1 } from './scene';
import type { Geometry, Vec2 } from './geometry';
import type { Mat } from './matrix';

export interface EffectGuide {
  /** The node and the effect they belong to. */
  node: string;
  effect: string;
  /** Polylines and points (the first is the root), in document coordinates. */
  lines: Vec2[][];
  points: Vec2[];
}

/**
 * The guides of every visible node's enabled effects that have them. `scene` is the one evaluated (formulas
 * resolved), so the guides sit where the drawing is. Nested compositions are left out.
 */
export function effectGuides(scene: SceneV1, nodes: Map<string, NodeInfo>, registry: Map<string, ModifierDef>, doc?: Pick<DocumentResult, 'geometry' | 'resultOf'>): EffectGuide[] {
  const out: EffectGuide[] = [];
  // `moved`: whether a group above has effects, which may move this node's drawing after its own stack
  // (Physics, Gravity, a Transform…); then the guides follow it.
  const visit = (list: SceneNode[], moved: boolean) => {
    for (const node of list) {
      const info = nodes.get(node.id);
      if (node.visible === false || !info) continue;
      let follow: Mat | null | undefined;
      for (const m of node.stack ?? []) {
        const def = m.enabled === false ? undefined : registry.get(m.type);
        if (!def?.guides) continue;
        const g = def.guides(resolveParams(def.params, (m.params ?? {}) as Record<string, unknown>) as never, info.refs?.[m.id] || info.bounds);
        if (follow === undefined) follow = moved && doc ? movedBy(node.id, info.matrix, doc) : null;
        const at = (q: readonly [number, number]): Vec2 => {
          const placed = apply(info.matrix, [q[0], q[1]]);
          return follow ? apply(follow, placed) : placed;
        };
        out.push({ node: node.id, effect: m.id, lines: g.lines.map((l) => l.map(at)), points: g.points.map(at) });
      }
      if (node.kind === 'group' && !node.composition) visit(node.children, moved || !!node.stack?.some((m) => m.enabled !== false));
    }
  };
  visit(scene.objects, false);
  return out;
}

const pointsOf = (geo: Geometry, node?: string): Vec2[] =>
  geo.shapes.filter((shape) => node === undefined || shape.node === node).flatMap((shape) => shape.subpaths.flatMap((path) => [path.start, ...path.segs.map((seg) => seg.p)]));

/**
 * How the groups above moved a node's drawing after its own stack, as a rigid motion (turn and shift), fitted
 * to its points before and after (they correspond one to one when the move only carries them: Physics,
 * Gravity, a Transform). Null if they don't correspond or it didn't move.
 */
function movedBy(id: string, matrix: Mat, doc: Pick<DocumentResult, 'geometry' | 'resultOf'>): Mat | null {
  const own = doc.resultOf(id);
  if (!own) return null;
  const before = pointsOf(own).map((q) => apply(matrix, q));
  const after = pointsOf(doc.geometry, id);
  if (!before.length || before.length !== after.length) return null;
  const n = before.length;
  let ax = 0, ay = 0, bx = 0, by = 0;
  for (let i = 0; i < n; i++) { ax += before[i]![0]; ay += before[i]![1]; bx += after[i]![0]; by += after[i]![1]; }
  ax /= n; ay /= n; bx /= n; by /= n;
  let dot = 0, cross = 0;
  for (let i = 0; i < n; i++) {
    const px = before[i]![0] - ax, py = before[i]![1] - ay, qx = after[i]![0] - bx, qy = after[i]![1] - by;
    dot += px * qx + py * qy;
    cross += px * qy - py * qx;
  }
  const angle = Math.atan2(cross, dot), c = Math.cos(angle), s = Math.sin(angle);
  if (Math.abs(angle) < 1e-9 && Math.hypot(bx - ax, by - ay) < 1e-9) return null;
  // Turn about the centre before, then carry it to the centre after.
  return [c, s, -s, c, bx - (c * ax - s * ay), by - (s * ax + c * ay)];
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Draws the guides into `svg` (a group of its own, last, in the viewBox's coordinates) while it is in Wire;
 * outside Wire, removes them.
 */
export function drawGuides(svg: SVGSVGElement, guides: EffectGuide[] | null): void {
  let layer = svg.querySelector(':scope > g[data-wire-guides]');
  if (!guides?.length || !svg.classList.contains('wire')) { layer?.remove(); return; }
  if (!layer) {
    layer = svg.ownerDocument.createElementNS(SVG_NS, 'g');
    layer.setAttribute('data-wire-guides', '');
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('pointer-events', 'none');
  }
  if (svg.lastElementChild !== layer) svg.append(layer);
  const f = (n: number) => Math.round(n * 100) / 100;
  // A dark stroke under a light one, readable over any colour; joints as small dots, the root in turquoise.
  let markup = '';
  for (const g of guides) {
    for (const line of g.lines) {
      const points = line.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
      markup += `<polyline points="${points}" fill="none" stroke="#000" stroke-opacity="0.55" stroke-width="4" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
      markup += `<polyline points="${points}" fill="none" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
    }
  }
  // Dots keep their size on screen: a radius in viewBox units from the SVG's scale.
  const scale = (() => { const m = svg.getScreenCTM?.(); return m && m.a ? 1 / Math.hypot(m.a, m.b) : 1; })();
  for (const g of guides) g.points.forEach(([x, y], i) => {
    markup += `<circle cx="${f(x)}" cy="${f(y)}" r="${f((i ? 4 : 5) * scale)}" fill="${i ? '#fff' : '#09fdd1'}" stroke="#000" stroke-opacity="0.6" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
  });
  if (layer.innerHTML !== markup) layer.innerHTML = markup;
}
