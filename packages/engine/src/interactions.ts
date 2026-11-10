// Interacciones: al pasar por encima (hover) o al hacer clic en un objeto, un valor va hacia otro con su
// duración y su curva, y vuelve (al salir, o con el siguiente clic). Si cambia de sentido a medias, invierte
// desde donde esté. `createPlayer` junta esto con la línea de tiempo para el código exportado y el editor.
import { ease, lerpValue, readTarget, sampleScene, writeTarget, type Ease, type Track } from './animation';
import type { SceneNode, SceneV2 } from './document';
import type { Engine } from './engine';

export type Trigger = 'hover' | 'click';

export interface Interaction {
  id: string;
  /** Objeto o grupo que la dispara (un grupo, con cualquiera de sus hijos). */
  node: string;
  trigger: Trigger;
  /** Qué valor cambia: como una pista de animación. */
  target: Pick<Track, 'node' | 'on' | 'modifier' | 'param'>;
  /** A qué valor va. */
  to: unknown;
  /** Segundos. */
  duration: number;
  ease?: Ease;
}

interface State {
  /** 0 = en reposo, 1 = en su destino. */
  progress: number;
  /** Hacia dónde va: 1 (al destino) o -1 (de vuelta). */
  dir: 1 | -1;
}

/** Estado de las interacciones de una escena: se le avisa de los eventos y da la escena del momento. */
export function createInteractions(getScene: () => SceneV2) {
  const states = new Map<string, State>();
  const parents = () => {
    const map = new Map<string, string | null>();
    const walk = (nodes: SceneNode[], parent: string | null) => {
      for (const n of nodes) {
        map.set(n.id, parent);
        if (n.kind === 'group') walk(n.children, n.id);
      }
    };
    walk(getScene().objects, null);
    return map;
  };
  /** ¿El objeto tocado es el de la interacción o está dentro de él? */
  const hits = (interaction: Interaction, hit: string, up: Map<string, string | null>) => {
    for (let id: string | null | undefined = hit; id; id = up.get(id)) if (id === interaction.node) return true;
    return false;
  };
  const list = () => getScene().interactions ?? [];

  return {
    /** Un evento sobre el objeto `hit` (el id de la forma tocada). */
    event(kind: 'enter' | 'leave' | 'click', hit: string | null) {
      const up = parents();
      for (const it of list()) {
        const st = states.get(it.id) ?? { progress: 0, dir: -1 };
        if (it.trigger === 'hover' && kind !== 'click') {
          if (kind === 'enter' && hit && hits(it, hit, up)) st.dir = 1;
          if (kind === 'leave' && (!hit || !hits(it, hit, up))) st.dir = -1;
        } else if (it.trigger === 'click' && kind === 'click' && hit && hits(it, hit, up)) st.dir = st.dir === 1 ? -1 : 1;
        states.set(it.id, st);
      }
    },
    /** Avanza `dt` segundos. Devuelve si algo se sigue moviendo. */
    step(dt: number): boolean {
      let moving = false;
      for (const it of list()) {
        const st = states.get(it.id);
        if (!st) continue;
        const next = Math.max(0, Math.min(1, st.progress + (st.dir * dt) / Math.max(0.001, it.duration)));
        if (next !== st.progress) moving = true;
        st.progress = next;
      }
      return moving;
    },
    /** La escena con los valores de las interacciones puestos encima (copia si hace falta). */
    apply(scene: SceneV2): SceneV2 {
      const active = list().filter((it) => (states.get(it.id)?.progress ?? 0) > 0);
      if (!active.length) return scene;
      const out = scene === getScene() ? (structuredClone(scene) as SceneV2) : scene;
      for (const it of active) {
        const from = readTarget(out, it.target);
        const k = ease(it.ease ?? 'ease-out', states.get(it.id)!.progress);
        writeTarget(out, it.target, lerpValue(from, it.to, k));
      }
      return out;
    },
    /** ¿Alguna interacción fuera de su reposo? */
    isActive(): boolean {
      return list().some((it) => (states.get(it.id)?.progress ?? 0) > 0);
    },
    reset() {
      states.clear();
    },
  };
}

/** La forma: el id del objeto de la escena (data-node) de un elemento. */
const nodeOfEl = (el: EventTarget | null) => ((el as Element | null)?.closest?.('[data-node]')?.getAttribute('data-node')) ?? null;
const nodeOf = (e: Event) => nodeOfEl(e.target);

/**
 * Reproduce una escena en un <svg>: su línea de tiempo (en bucle o una vez) y sus interacciones.
 * Con «reducir movimiento», la animación se queda en su final; las interacciones cambian sin transición.
 */
export function createPlayer(engine: Engine, svg: SVGSVGElement, scene: SceneV2) {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const inter = createInteractions(() => scene);
  const anim = scene.animation?.tracks.length ? scene.animation : null;
  const live = engine.mount(svg, anim ? sampleScene(scene, reduce ? anim.duration : 0) : scene);
  const t0 = performance.now();
  let last = t0;
  let frame = 0;
  const draw = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    const moving = inter.step(reduce ? 1e6 : dt);
    let t = 0;
    if (anim) {
      const e = (now - t0) / 1000;
      t = reduce ? anim.duration : anim.loop === false ? Math.min(e, anim.duration) : e % anim.duration;
    }
    live.update(inter.apply(anim ? sampleScene(scene, t) : scene));
    const keepGoing = (anim && !reduce && (anim.loop !== false || t < anim.duration)) || moving;
    frame = keepGoing ? requestAnimationFrame(draw) : 0;
  };
  const wake = () => {
    if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(draw);
    }
  };
  const enter = (e: Event) => {
    inter.event('enter', nodeOf(e));
    wake();
  };
  // Al salir de una forma, cuenta adónde va el puntero (otra forma del mismo objeto, o el vacío).
  const leave = (e: PointerEvent) => {
    inter.event('leave', nodeOfEl(e.relatedTarget));
    wake();
  };
  const click = (e: Event) => {
    inter.event('click', nodeOf(e));
    wake();
  };
  if (scene.interactions?.length) {
    svg.addEventListener('pointerover', enter);
    svg.addEventListener('pointerout', leave);
    svg.addEventListener('click', click);
    // Que se note que se puede tocar.
    for (const it of scene.interactions) for (const el of svg.querySelectorAll(`[data-node]`)) if (el.getAttribute('data-node') === it.node) (el as SVGElement).style.cursor = 'pointer';
  }
  wake();
  return {
    /** Vuelve a pintar (si un script ha cambiado la escena). */
    refresh: wake,
    stop() {
      cancelAnimationFrame(frame);
      svg.removeEventListener('pointerover', enter);
      svg.removeEventListener('pointerout', leave);
      svg.removeEventListener('click', click);
    },
  };
}
