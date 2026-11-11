import { defineModifier } from '../modifier';

/**
 * Mask: the object only shows where another one lets it (`source`), with SVG's native mask (`<mask>`).
 * - shape: what falls inside the mask's shape shows (`invert`: what is outside).
 * - luminance: its colours decide: white shows; black doesn't; greys, partly. A gradient from
 *   white to black gives soft fades.
 * The mask is read already placed, with its effects and animation: moving it moves the window. It is
 * usually hidden (the eye): hidden, it still works. It applies to the whole object, after its whole stack.
 */
export const mask = defineModifier({
  type: 'mask',
  label: 'Mask',
  kind: 'style',
  mask: true,
  params: {
    source: { type: 'node', default: '', label: 'Mask' },
    mode: { type: 'enum', default: 'shape', options: ['shape', 'luminance'] as const, label: 'Mode', animatable: false },
    invert: { type: 'boolean', default: false, label: 'Invert', showIf: { mode: ['shape'] }, animatable: false },
  },
  apply: (geo) => geo,
});
