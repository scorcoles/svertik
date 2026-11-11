import { defineModifier } from '../modifier';

/**
 * Máscara: el objeto solo se ve donde lo deja otro (`source`), con la máscara nativa de SVG (`<mask>`).
 * - shape: se ve lo que cae dentro de la forma de la máscara (`invert`: lo de fuera).
 * - luminance: sus colores deciden: blanco, se ve; negro, no; los grises, a medias. Con un degradado de
 *   blanco a negro salen fundidos suaves.
 * La máscara se lee ya colocada, con sus efectos y su animación: moverla es mover la ventana. Suele ir
 * oculta (el ojo): oculta, sigue sirviendo. Se aplica al objeto entero, después de toda su pila.
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
