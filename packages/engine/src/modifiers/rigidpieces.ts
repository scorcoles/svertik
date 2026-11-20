import { bounds, type Geometry, type Shape } from '../geometry';
import { defineModifier, type ModifierContext } from '../modifier';

const pivotPoint: Record<NonNullable<Shape['rigidPivot']>, [number, number]> = {
  center: [0.5, 0.5], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1],
  s: [0.5, 1], sw: [0, 1], w: [0, 0.5], nw: [0, 0],
};

/** Marks each current element as a rigid piece for compatible downstream deformers. */
export const rigidpieces = defineModifier({
  type: 'rigidpieces',
  label: 'Rigid Pieces',
  kind: 'effector',
  params: {
    amount: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'Amount', ramp: false },
    pivot: { type: 'enum', default: 'center', options: ['center', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const, label: 'Pivot', animatable: false },
  },
  apply(geo, p, ctx) {
    const groupIds = new Map<string, number>();
    const marked: Geometry = {
      ...geo,
      shapes: geo.shapes.map((shape, index) => {
        const key = shape.rigidGroup !== undefined ? `rigid:${shape.rigidGroup}`
          : shape.bodyGroup !== undefined ? `body:${shape.bodyGroup}`
            : shape.clone !== undefined ? `clone:${shape.clone}` : `shape:${index}`;
        let group = groupIds.get(key);
        if (group === undefined) groupIds.set(key, (group = groupIds.size));
        return { ...shape, rigidGroup: group, rigidAmount: p.amount, rigidPivot: p.pivot as Shape['rigidPivot'] };
      }),
    };
    const children = ctx.children.filter((child) => child.enabled && child.def.kind === 'deformer');
    if (!children.length) return marked;

    // Apply child deformers to each rigid element in isolation so their own bounds,
    // pivots and 3D projection are measured per piece rather than across the whole mosaic.
    const pieces = new Map<number, Shape[]>();
    for (const shape of marked.shapes) {
      const group = shape.rigidGroup!;
      const members = pieces.get(group) ?? [];
      members.push(shape);
      pieces.set(group, members);
    }
    const transformed = new Map<number, Geometry>();
    for (const [group, shapes] of pieces) {
      let part: Geometry = { viewBox: marked.viewBox, shapes };
      const deferred: NonNullable<Shape['rigidTransforms']> = [];
      for (const child of children) {
        if (child.def.type === 'transform' || child.def.type === 'rotate3d') {
          deferred.push({ type: child.def.type, params: child.params });
          continue;
        }
        const local: ModifierContext = { ...ctx, bounds: bounds(part), children: child.children };
        part = child.def.apply(part, child.params as never, local);
      }
      if (deferred.length) part.shapes = part.shapes.map((shape) => ({ ...shape, rigidTransforms: deferred }));
      transformed.set(group, part);
    }
    return { ...marked, shapes: [...transformed.values()].flatMap((part) => part.shapes) };
  },
});
