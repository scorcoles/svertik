import { defineModifier } from '../modifier';

/** Marks each current element as a rigid piece for compatible downstream deformers. */
export const rigidpieces = defineModifier({
  type: 'rigidpieces',
  label: 'Rigid Pieces',
  kind: 'deformer',
  params: {
    tilt: { type: 'number', default: 0, min: 0, max: 90, step: 1, unit: '°', label: 'Tilt', ramp: false },
    alternate: { type: 'boolean', default: false, label: 'Alternate direction' },
  },
  apply(geo, p) {
    const groups = new Map<string, number>();
    return {
      ...geo,
      shapes: geo.shapes.map((shape, index) => {
        const key = shape.rigidGroup !== undefined ? `rigid:${shape.rigidGroup}`
          : shape.bodyGroup !== undefined ? `body:${shape.bodyGroup}`
            : shape.clone !== undefined ? `clone:${shape.clone}` : `shape:${index}`;
        let group = groups.get(key);
        if (group === undefined) groups.set(key, (group = groups.size));
        return { ...shape, rigidGroup: group, rigidTilt: p.tilt, rigidTiltAlternate: p.alternate };
      }),
    };
  },
});
