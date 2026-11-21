import type { Geometry, NodeInfo, SceneNode, SceneV1 } from '@svertik/engine';
import { walkNodes } from '@svertik/engine';

const SPARSE_LINE_EFFECTS = new Set(['crosshatch', 'contour', 'stringart', 'spirograph', 'flowfield', 'weave', 'network', 'trace', 'connect']);

/** Sparse generated linework remains easy to select: blank space inside its source box is grabbable. */
export function generatedObjectAt(scene: SceneV1, geometry: Geometry, nodes: Map<string, NodeInfo>, x: number, y: number): string | null {
  const effects = new Set<string>();
  const parents = new Map<string, SceneNode | null>();
  const sceneNodes = new Map<string, SceneNode>();
  const visit = (stack: { id: string; type: string; enabled?: boolean; children?: unknown[] }[]) => {
    for (const item of stack) if (item.enabled !== false) {
      if (SPARSE_LINE_EFFECTS.has(item.type)) effects.add(item.id);
      if (item.children) visit(item.children as typeof stack);
    }
  };
  for (const { node, parent } of walkNodes(scene.objects)) { parents.set(node.id, parent); sceneNodes.set(node.id, node); visit(node.stack); }
  if (!effects.size) return null;
  const effectIds = [...effects];
  const seen = new Set<string>();
  // The evaluated paint order, rather than map insertion order, decides which object is in front.
  for (let i = geometry.shapes.length - 1; i >= 0; i--) {
    const id = geometry.shapes[i]!.node;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    let node = sceneNodes.get(id) ?? null;
    while (node) {
      const info = nodes.get(node.id);
      const b = info?.box;
      if (info && effectIds.some((effect) => info.refs?.[effect]) && b
        && x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) return node.id;
      node = parents.get(node.id) ?? null;
    }
  }
  return null;
}

/** @deprecated Use generatedObjectAt. Kept for existing editor hit-region callers. */
export const hatchObjectAt = generatedObjectAt;
