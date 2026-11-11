import { bounds, type Geometry, type Shape } from '../geometry';
import { defineModifier, rampParams, type ModifierContext } from '../modifier';

/**
 * Incremental effector: applies the modifiers nested in it
 * to each element separately, with their numbers multiplied by the element's position.
 * A 10° Twist under Step: the first turns 10°, the second 20°…
 * The elements are the Clone copies; without Clone, each shape of the SVG.
 * Within each element, fractions (centre, pivot…) are measured on its own box.
 */
export const step = defineModifier({
  type: 'step',
  label: 'Step',
  kind: 'effector',
  params: {
    strength: { type: 'number', default: 1, min: 0, max: 2, step: 0.01, ramp: false },
    reverse: { type: 'boolean', default: false, animatable: false },
  },
  apply(geo, p, ctx) {
    const children = ctx.children.filter((c) => c.enabled);
    if (!children.length) return geo;

    // Elements: by copy number if there are any; otherwise one shape = one element.
    const tagged = geo.shapes.some((s) => s.clone !== undefined);
    const keyOf = (s: Shape, i: number) => (tagged ? (s.clone ?? -1) : i);
    const keys = [...new Set(geo.shapes.map(keyOf))].filter((k) => k >= 0).sort((a, b) => a - b);
    const n = keys.length;
    const order = new Map(keys.map((k, i) => [k, p.reverse ? n - i : i + 1]));

    const out: Shape[] = [];
    const untouched: Shape[] = [];
    // The inner filters the pieces bring (RGB Split inside Step).
    let inner = geo.inner;
    for (const key of keys) {
      const own = geo.shapes.filter((s, i) => keyOf(s, i) === key);
      let part: Geometry = { viewBox: geo.viewBox, shapes: own };
      const k = order.get(key)! * p.strength;
      const local: ModifierContext = { ...ctx, bounds: bounds(part), children: [] };
      for (const c of children) {
        const params = rampParams(c.def.params, c.params, k);
        part = c.def.apply(part, params, { ...local, children: c.children });
      }
      out.push(...part.shapes.map((s) => (tagged ? { ...s, clone: key } : s)));
      if (part.inner) inner = { ...inner, ...part.inner };
    }
    for (const [i, s] of geo.shapes.entries()) if (keyOf(s, i) < 0) untouched.push(s);
    return { viewBox: geo.viewBox, shapes: [...out, ...untouched], ...(inner ? { inner } : {}) };
  },
});
