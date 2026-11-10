import { ease, EASES, type Ease } from '../animation';
import { defineModifier } from '../modifier';
import { rng } from '../random';
import { applyWeighted, keyFor } from './weighted';

/**
 * Escalonado (como el stagger de GSAP): cada elemento hace su propia transición, con su curva, un poco
 * después del anterior. Progress (0–1) es la animación entera: anímalo con dos claves.
 * - in: los elementos empiezan con los efectos colgados puestos y acaban en su sitio (entradas);
 * - out: empiezan en su sitio y acaban con los efectos (salidas).
 * Stagger: 0, todos a la vez; 1, uno detrás de otro sin solaparse.
 */
export const stagger = defineModifier({
  type: 'stagger',
  label: 'Stagger',
  kind: 'effector',
  params: {
    progress: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'Progress', ramp: false },
    direction: { type: 'enum', default: 'in', options: ['in', 'out'] as const, animatable: false },
    stagger: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'Stagger', ramp: false },
    ease: { type: 'enum', default: 'ease-out', options: EASES.filter((e) => e !== 'hold'), animatable: false },
    order: { type: 'enum', default: 'forward', options: ['forward', 'reverse', 'center', 'edges', 'random'] as const, animatable: false },
    unit: { type: 'enum', default: 'elements', options: ['elements', 'words', 'lines'] as const, animatable: false },
    seed: { type: 'seed', default: 1 },
  },
  apply(geo, p, ctx) {
    const keyOf = keyFor(geo, p.unit);
    const keys = [...new Set(geo.shapes.map(keyOf))].filter((k) => k >= 0).sort((a, b) => a - b);
    const n = keys.length;
    if (!n) return geo;
    // Turno de cada elemento (0 = el primero en moverse).
    const turn = new Map<number, number>();
    if (p.order === 'random') {
      const rand = rng(p.seed);
      const sh = [...keys];
      for (let i = sh.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [sh[i], sh[j]] = [sh[j]!, sh[i]!];
      }
      sh.forEach((k, i) => turn.set(k, i));
    } else {
      const mid = (n - 1) / 2;
      keys.forEach((k, i) => {
        const t = p.order === 'reverse' ? n - 1 - i : p.order === 'center' ? Math.abs(i - mid) * 2 : p.order === 'edges' ? (mid - Math.abs(i - mid)) * 2 : i;
        turn.set(k, t);
      });
    }
    const last = Math.max(...turn.values()) || 1;
    // Cada elemento dura L; el siguiente empieza `stagger` de L después (sin solapar con stagger 1).
    const s = Math.max(0, Math.min(1, p.stagger));
    const L = 1 / (1 + last * s);
    const e = p.ease as Ease;
    return applyWeighted(
      geo,
      ctx,
      keyOf,
      (key) => {
        const start = turn.get(key)! * s * L;
        const local = Math.max(0, Math.min(1, (p.progress - start) / L));
        const done = ease(e, local);
        // in: con el efecto al principio (peso 1) y en su sitio al final (0); out, al revés.
        return p.direction === 'out' ? done : 1 - done;
      },
      1,
      [-1, 2],
    );
  },
});
