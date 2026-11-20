import type { Geometry, NodeInfo, SceneV1 } from '@svertik/engine';
import { walkNodes } from '@svertik/engine';

/** Generated hatching remains one editor object: blank space between its strokes is grabbable. */
export function hatchObjectAt(scene: SceneV1, geometry: Geometry, nodes: Map<string, NodeInfo>, x: number, y: number): string | null {
  const effects = new Set<string>();
  const visit = (stack: { id: string; type: string; enabled?: boolean; children?: unknown[] }[]) => {
    for (const item of stack) if (item.enabled !== false) {
      if (item.type === 'crosshatch') effects.add(item.id);
      if (item.children) visit(item.children as typeof stack);
    }
  };
  for (const { node } of walkNodes(scene.objects)) visit(node.stack);
  if (!effects.size) return null;
  const seen = new Set<string>();
  // The evaluated paint order, rather than map insertion order, decides which object is in front.
  for (let i = geometry.shapes.length - 1; i >= 0; i--) {
    const id = geometry.shapes[i]!.node;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const info = nodes.get(id);
    if (!info || ![...effects].some((effect) => info.refs?.[effect])) continue;
    const b = info.box;
    if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) return id;
  }
  return null;
}
