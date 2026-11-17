import { bounds, flatten, insidePolygons, type Geometry, type Vec2 } from '../geometry';
import { apply } from '../matrix';
import { defineModifier, fromFraction } from '../modifier';
import { applyWeighted, keyFor, smooth } from './weighted';

/**
 * Field: the nested effects act more or less on each element
 * depending on where it is relative to a shape (ellipse, plane or box). Moving the field sweeps the drawing.
 * Circle and Box take Width and Height (and turn with Angle); Linear fades over Distance in the direction of Angle.
 * Contain says when an element is inside: its centre, all of it (full) or any part of it (partial).
 * Softness: how much of the edge is a transition (0, a hard cut; 1, all gradient).
 * From an Effector node, the field is a place in the scene (fractions of the document) shared by all its targets.
 */
export const field = defineModifier({
  type: 'field',
  label: 'Field',
  kind: 'effector',
  params: {
    shape: { type: 'enum', default: 'circle', options: ['circle', 'linear', 'box'] as const, animatable: false },
    center: { type: 'point', default: [0.5, 0.5], unit: 'fraction', label: 'Center' },
    width: { type: 'number', default: 0.7, min: 0.01, max: 4, step: 0.01, unit: 'fraction', label: 'Width', ramp: false, showIf: { shape: ['circle', 'box'] } },
    height: { type: 'number', default: 0.7, min: 0.01, max: 4, step: 0.01, unit: 'fraction', label: 'Height', ramp: false, showIf: { shape: ['circle', 'box'] } },
    distance: { type: 'number', default: 0.35, min: 0.01, max: 2, step: 0.01, unit: 'fraction', label: 'Distance', ramp: false, showIf: { shape: ['linear'] } },
    contain: { type: 'enum', default: 'center', options: ['center', 'full', 'partial'] as const, label: 'Contain', animatable: false },
    softness: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'Softness', ramp: false },
    angle: { type: 'angle', default: 0, ramp: false, label: 'Angle' },
    invert: { type: 'boolean', default: false, label: 'Invert', animatable: false },
    amount: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'Amount', ramp: false },
    unit: { type: 'enum', default: 'elements', options: ['elements', 'words', 'lines'] as const, animatable: false },
  },
  apply(geo, p, ctx) {
    // Where the field is measured: the scene's document (from an Effector node) or this drawing's box.
    const space = ctx.scene;
    const b = space?.frame ?? ctx.bounds;
    const toField = space ? (q: Vec2) => apply(space.world, q) : (q: Vec2) => q;
    const size = Math.max(b.width, b.height) || 1;
    const c = fromFraction(b, p.center);
    // Half extents of the circle/box and the fade distance of the plane, in px.
    const hw = Math.max(1e-6, (p.width * size) / 2);
    const hh = Math.max(1e-6, (p.height * size) / 2);
    const D = Math.max(1e-6, p.distance * size);
    const a = (p.angle * Math.PI) / 180;
    const [ux, uy] = [Math.cos(a), Math.sin(a)];
    // Normalised distance of a point (0 at the centre of the shape, 1 at its edge).
    const distance = ([px, py]: Vec2) => {
      const [x, y] = [px - c[0], py - c[1]];
      if (p.shape === 'linear') {
        // Plane: full behind the line (in the direction of the angle) and fading over Distance.
        const s = x * ux + y * uy;
        return s <= 0 ? 0 : s / D;
      }
      // Local axes of the shape, turned by Angle.
      const [lx, ly] = [(x * ux + y * uy) / hw, (-x * uy + y * ux) / hh];
      return p.shape === 'box' ? Math.max(Math.abs(lx), Math.abs(ly)) : Math.hypot(lx, ly);
    };
    const elementDistance = (part: Geometry) => {
      if (p.contain === 'center') {
        const pb = bounds(part);
        return distance(toField([pb.x + pb.width / 2, pb.y + pb.height / 2]));
      }
      // Its outline: all of it inside (full) is its farthest point; touching (partial), its nearest one.
      const polys = part.shapes.flatMap((s) => s.subpaths.map((sp) => flatten(sp).map(toField)));
      const ds = polys.flat().map(distance);
      if (!ds.length) return Infinity;
      if (p.contain === 'full') return Math.max(...ds);
      // The field can also sit inside the element without touching its outline.
      if (p.shape !== 'linear' && insidePolygons(polys, c)) return 0;
      return Math.min(...ds);
    };
    // Normalised distance → weight, with a softened edge.
    const falloff = (d: number) => {
      const inner = 1 - Math.max(0, Math.min(1, p.softness));
      if (d <= inner) return 1;
      if (d >= 1) return 0;
      return smooth(1 - (d - inner) / (1 - inner || 1));
    };
    return applyWeighted(
      geo,
      ctx,
      keyFor(geo, p.unit),
      (_k, _i, _n, part) => {
        const w = falloff(elementDistance(part));
        return p.invert ? 1 - w : w;
      },
      p.amount,
    );
  },
});
