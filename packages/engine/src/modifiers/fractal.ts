import { apply as applyMat, IDENTITY, multiply, rotateScale, translate, type Mat } from '../matrix';
import { bounds, mapPoints, type Geometry, type Shape } from '../geometry';
import { defineModifier } from '../modifier';
import { fitViewBox } from './clone';

/** Tope de copias: los fractales crecen exponencialmente (Carpet con 4 niveles ya son 4 096). */
export const FRACTAL_MAX_COPIES = 4096;

/**
 * Repite el dibujo dentro de sí mismo, cada vez más pequeño (sistema de funciones iteradas):
 * - sierpinski: 3 copias a la mitad (triángulo de Sierpinski); se queda el último nivel;
 * - carpet: 8 copias a un tercio alrededor de un hueco (alfombra de Sierpinski); el último nivel;
 * - tree: dos ramas giradas ±`angle` y escaladas `ratio` sobre la cima de cada una; todos los niveles;
 * - spiral: cada copia girada `angle` y escalada `ratio` alrededor de un punto a su derecha; todas.
 * Cada copia es un elemento (Step, Color…), en orden de generación. Si se pasaría del tope, baja la profundidad.
 */
export const fractal = defineModifier({
  type: 'fractal',
  label: 'Fractal',
  kind: 'generator',
  params: {
    preset: { type: 'enum', default: 'sierpinski', options: ['sierpinski', 'carpet', 'tree', 'spiral'] as const, animatable: false },
    depth: { type: 'number', default: 4, min: 1, max: 12, step: 1, ramp: false, label: 'Depth' },
    ratio: { type: 'number', default: 0.7, min: 0.2, max: 0.95, step: 0.01, label: 'Scale', ramp: false },
    angle: { type: 'angle', default: 25, ramp: false },
  },
  apply(geo, p) {
    const b = bounds(geo);
    if (b.width <= 0 && b.height <= 0) return geo;
    const [w, h] = [b.width, b.height];
    const c: [number, number] = [b.x + w / 2, b.y + h / 2];
    const at = (pt: readonly [number, number]) => (m: Mat): Mat => multiply(translate(pt[0], pt[1]), multiply(m, translate(-pt[0], -pt[1])));
    const scaleAbout = (k: number, dx: number, dy: number): Mat => multiply(translate(dx, dy), at(c)([k, 0, 0, k, 0, 0]));

    let maps: Mat[];
    let keepAll = false;
    if (p.preset === 'carpet') {
      maps = [];
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (i || j) maps.push(scaleAbout(1 / 3, (i * w) / 3, (j * h) / 3));
    } else if (p.preset === 'tree') {
      // Rama: su base (abajo, centro) va a la cima (arriba, centro) de la madre, girada y escalada.
      const top: [number, number] = [c[0], b.y];
      const base: [number, number] = [c[0], b.y + h];
      const branch = (sign: number) => multiply(translate(top[0], top[1]), multiply(rotateScale(sign * p.angle, p.ratio), translate(-base[0], -base[1])));
      maps = [branch(-1), branch(1)];
      keepAll = true;
    } else if (p.preset === 'spiral') {
      // Gira y encoge alrededor de un punto a la derecha del dibujo: las copias se enroscan hacia él.
      const pivot: [number, number] = [b.x + w * 1.1, c[1]];
      maps = [at(pivot)(rotateScale(p.angle, p.ratio))];
      keepAll = true;
    } else {
      maps = [scaleAbout(0.5, 0, -h / 4), scaleAbout(0.5, -w / 4, h / 4), scaleAbout(0.5, w / 4, h / 4)];
    }

    // Profundidad que cabe en el tope (spiral crece en línea, el resto en potencia).
    const k = maps.length;
    let depth = Math.max(1, Math.round(p.depth));
    const count = (d: number) => (k === 1 ? d + 1 : keepAll ? (k ** (d + 1) - 1) / (k - 1) : k ** d);
    while (depth > 1 && count(depth) > FRACTAL_MAX_COPIES) depth--;

    let level: Mat[] = [IDENTITY];
    const all: Mat[] = keepAll ? [IDENTITY] : [];
    for (let d = 0; d < depth; d++) {
      level = level.flatMap((m) => maps.map((t) => multiply(m, t)));
      if (keepAll) all.push(...level);
    }
    const copies = keepAll ? all : level;

    const shapes: Shape[] = [];
    copies.forEach((m, index) => {
      const moved = mapPoints(geo, (q) => applyMat(m, q));
      shapes.push(...moved.shapes.map((s) => ({ ...s, clone: index })));
    });
    const out: Geometry = { viewBox: geo.viewBox, shapes };
    return { ...out, viewBox: fitViewBox(geo.viewBox, bounds(out)) };
  },
});
