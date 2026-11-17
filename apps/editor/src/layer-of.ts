import { walkNodes, type SceneNode } from '@svertik/engine';

/**
 * The layer each object belongs to (id → layer name), for the headings of object pickers.
 * Empty when the scene has no layers. Layers themselves are not listed.
 */
export function layerOf(objects: SceneNode[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const layer of objects) {
    if (layer.kind !== 'group' || !layer.layer) continue;
    for (const { node } of walkNodes(layer.children ?? [])) out.set(node.id, layer.name);
  }
  return out;
}
