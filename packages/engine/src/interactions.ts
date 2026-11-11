// Interacciones: algo pasa (el puntero entra o sale de un objeto, un clic, el dibujo entra en pantalla) y
// svertik hace algo:
// - tween: un valor va hacia otro con su duración y su curva, y vuelve (al salir, o con el siguiente clic);
// - play: la línea de tiempo recorre un tramo (al entrar, hacia delante; al salir, de vuelta; clic: desde el principio);
// - seed: una semilla nueva para un efecto (un Glitch o un Damage distinto en cada clic);
// - toggle: enciende o apaga un efecto;
// - follow (con el disparador «pointer»): un valor sigue al puntero mientras está sobre el dibujo: la posición
//   de un objeto o un punto de un efecto van bajo el puntero; un número recorre de `range[0]` a `range[1]`
//   según dónde esté el puntero en el documento (en horizontal o en vertical). `duration`: la inercia (s).
//   Al salir, vuelve a su sitio (salvo `stay`).
// `createPlayer` junta esto con la línea de tiempo: lo usan el código exportado y el modo Play del editor.
import { ease, lerpValue, readTarget, sampleScene, writeTarget, type Ease, type Track } from './animation';
import type { DocumentResult, SceneNode, SceneV2 } from './document';
import { apply as applyMat, invert } from './matrix';
import type { Engine } from './engine';

export type Trigger = 'hover' | 'click' | 'enter' | 'pointer';
export type Action = 'tween' | 'play' | 'seed' | 'toggle' | 'follow';

export interface Interaction {
  id: string;
  /** Objeto o grupo que la dispara (un grupo, con cualquiera de sus hijos). Con «enter», el dibujo entero. */
  node: string;
  trigger: Trigger;
  /** Qué hace (por defecto, tween). */
  action?: Action;
  /** Sobre qué: el valor (tween, seed) o el efecto (toggle: basta con node y modifier). */
  target: Pick<Track, 'node' | 'on' | 'modifier' | 'param'>;
  /** tween: a qué valor va. */
  to: unknown;
  /** tween: segundos. */
  duration: number;
  ease?: Ease;
  /** play: el tramo de la línea de tiempo, en segundos [desde, hasta]. */
  segment?: [number, number];
  /** follow: qué eje del puntero cuenta (en un punto o la posición, `both`: los dos). */
  axis?: 'x' | 'y' | 'both';
  /** follow, sobre un número: el valor con el puntero en un borde del documento y en el otro. */
  range?: [number, number];
  /** follow: al salir el puntero, se queda donde estaba (si no, vuelve a su sitio). */
  stay?: boolean;
}

interface State {
  /** tween y toggle: 0 = en reposo, 1 = en su destino (toggle salta). */
  progress: number;
  /** Hacia dónde va: 1 (al destino) o -1 (de vuelta). */
  dir: 1 | -1;
  /** seed: la semilla puesta por la interacción. */
  seed?: number;
  /** play: el cabezal y adónde va. */
  head?: number;
  goal?: number;
  /** follow: el valor de ahora y adónde va (`rest`: a su sitio). */
  value?: unknown;
  aim?: unknown;
}

const actionOf = (it: Interaction): Action => it.action ?? 'tween';

/** follow: el valor en reposo (el de la escena). La posición, como [x, y]. */
function restOf(scene: SceneV2, it: Interaction): unknown {
  if (it.target.on === 'node' && it.target.param === 'position') {
    return [Number(readTarget(scene, { ...it.target, param: 'x' }) ?? 0), Number(readTarget(scene, { ...it.target, param: 'y' }) ?? 0)];
  }
  return readTarget(scene, it.target);
}
function writeFollow(scene: SceneV2, it: Interaction, v: unknown) {
  if (it.target.on === 'node' && it.target.param === 'position' && Array.isArray(v)) {
    writeTarget(scene, { ...it.target, param: 'x' }, v[0]);
    writeTarget(scene, { ...it.target, param: 'y' }, v[1]);
  } else writeTarget(scene, it.target, v);
}
const isPair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number');

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
  const stateOf = (it: Interaction) => {
    let st = states.get(it.id);
    if (!st) states.set(it.id, (st = { progress: 0, dir: -1 }));
    return st;
  };

  /** Lo que hace una interacción cuando se dispara (forward) o se deshace (al salir el puntero, otro clic). */
  function fire(it: Interaction, forward: boolean, restart = false) {
    const st = stateOf(it);
    const act = actionOf(it);
    if (act === 'seed') {
      if (forward) st.seed = 1 + Math.floor(Math.random() * 9999);
      return;
    }
    if (act === 'play') {
      const [a, b] = it.segment ?? [0, getScene().animation?.duration ?? 0];
      if (restart) st.head = a;
      st.head ??= a;
      st.goal = forward ? b : a;
      return;
    }
    st.dir = forward ? 1 : -1;
    if (act === 'toggle') st.progress = forward ? 1 : 0;
  }

  /** follow: adónde va el valor con el puntero en `q` (en el documento), según lo que sigue. */
  function aimOf(it: Interaction, q: [number, number], doc: DocumentResult, up: Map<string, string | null>): unknown {
    const scene = getScene();
    const rest = restOf(scene, it);
    const axis = it.axis ?? 'both';
    const keep = (p: [number, number]): [number, number] =>
      isPair(rest) ? [axis === 'y' ? rest[0] : p[0], axis === 'x' ? rest[1] : p[1]] : p;
    const t = it.target;
    if (t.on === 'node' && t.param === 'position') {
      // En las coordenadas de su grupo (si lo tiene): su centro, bajo el puntero.
      const parent = up.get(t.node);
      const m = parent ? doc.nodes.get(parent)?.matrix : null;
      const p = m ? applyMat(invert(m), q) : q;
      return keep([p[0], p[1]]);
    }
    if (isPair(rest)) {
      // Un punto de un efecto (fracciones de la caja sobre la que mide el efecto): bajo el puntero.
      const info = doc.nodes.get(t.node);
      if (!info) return rest;
      const box = (t.modifier && info.refs?.[t.modifier]) || info.bounds;
      const local = applyMat(invert(info.matrix), q);
      const f = (v: number, a: number, w: number) => Math.round(((v - a) / (w || 1)) * 1000) / 1000;
      return keep([f(local[0], box.x, box.width), f(local[1], box.y, box.height)]);
    }
    // Un número: de range[0] a range[1] a lo ancho (o a lo alto) del documento.
    const [vx, vy, vw, vh] = doc.geometry.viewBox;
    const k = Math.max(0, Math.min(1, axis === 'y' ? (q[1] - vy) / (vh || 1) : (q[0] - vx) / (vw || 1)));
    const [a, b] = it.range ?? [0, 1];
    return a + (b - a) * k;
  }

  return {
    /** El puntero sobre el dibujo (en coordenadas del documento), o null si ha salido. Para «follow». */
    pointer(q: [number, number] | null, doc: DocumentResult | null) {
      const up = parents();
      for (const it of list()) {
        if (it.trigger !== 'pointer' || actionOf(it) !== 'follow') continue;
        const st = stateOf(it);
        if (q && doc) st.aim = aimOf(it, q, doc, up);
        else if (!it.stay) st.aim = 'rest';
      }
    },
    /** Un evento sobre el objeto `hit` (el id de la forma tocada). «view»: el dibujo entra en pantalla. */
    event(kind: 'enter' | 'leave' | 'click' | 'view', hit: string | null) {
      const up = parents();
      for (const it of list()) {
        if (it.trigger === 'enter') {
          if (kind === 'view') fire(it, true, true);
        } else if (it.trigger === 'hover' && kind !== 'click' && kind !== 'view') {
          if (kind === 'enter' && hit && hits(it, hit, up)) fire(it, true);
          if (kind === 'leave' && (!hit || !hits(it, hit, up))) fire(it, false);
        } else if (it.trigger === 'click' && kind === 'click' && hit && hits(it, hit, up)) {
          const act = actionOf(it);
          // Clic: el tween y el toggle alternan; play vuelve a empezar; seed, una nueva cada vez.
          if (act === 'play' || act === 'seed') fire(it, true, true);
          else fire(it, stateOf(it).dir !== 1);
        }
      }
    },
    /** Avanza `dt` segundos. Devuelve si algo se sigue moviendo. */
    step(dt: number): boolean {
      let moving = false;
      for (const it of list()) {
        const st = states.get(it.id);
        if (!st) continue;
        const act = actionOf(it);
        if (act === 'play' && st.head !== undefined && st.goal !== undefined && st.head !== st.goal) {
          const d = st.goal - st.head;
          st.head = Math.abs(d) <= dt ? st.goal : st.head + Math.sign(d) * dt;
          moving = true;
        } else if (act === 'follow') {
          if (st.aim === undefined) continue;
          const goal = st.aim === 'rest' ? restOf(getScene(), it) : st.aim;
          const from = st.value ?? restOf(getScene(), it);
          // Inercia: se acerca un poco cada fotograma (exponencial: no depende de los fps).
          const k = it.duration > 0 ? 1 - Math.exp(-dt / it.duration) : 1;
          const next = lerpValue(from, goal, k);
          const close = isPair(next) && isPair(goal) ? Math.hypot(next[0] - goal[0], next[1] - goal[1]) < 1e-3 : typeof next === 'number' && typeof goal === 'number' ? Math.abs(next - goal) < 1e-3 : true;
          if (close) {
            st.value = st.aim === 'rest' ? undefined : goal;
            if (st.aim === 'rest') st.aim = undefined;
            else moving = moving || st.value !== from;
          } else {
            st.value = next;
            moving = true;
          }
        } else if (act === 'tween') {
          const next = Math.max(0, Math.min(1, st.progress + (st.dir * dt) / Math.max(0.001, it.duration)));
          if (next !== st.progress) moving = true;
          st.progress = next;
        }
      }
      return moving;
    },
    /** El cabezal que piden las interacciones «play» (el de la última que se movió), o null. */
    playhead(): number | null {
      let head: number | null = null;
      for (const it of list()) {
        const st = states.get(it.id);
        if (actionOf(it) === 'play' && st?.head !== undefined) head = st.head;
      }
      return head;
    },
    /** La escena con los valores de las interacciones puestos encima (copia si hace falta). */
    apply(scene: SceneV2): SceneV2 {
      const touched = list().filter((it) => {
        const st = states.get(it.id);
        if (!st) return false;
        const act = actionOf(it);
        return act === 'seed' ? st.seed !== undefined : act === 'play' ? false : act === 'follow' ? st.value !== undefined : st.progress > 0;
      });
      if (!touched.length) return scene;
      const out = scene === getScene() ? (structuredClone(scene) as SceneV2) : scene;
      for (const it of touched) {
        const st = states.get(it.id)!;
        const act = actionOf(it);
        if (act === 'follow') writeFollow(out, it, st.value);
        else if (act === 'seed') writeTarget(out, it.target, st.seed);
        else if (act === 'toggle') toggleEnabled(out, it.target.node, it.target.modifier);
        else writeTarget(out, it.target, lerpValue(readTarget(out, it.target), it.to, ease(it.ease ?? 'ease-out', st.progress)));
      }
      return out;
    },
    /** ¿Alguna interacción fuera de su reposo? */
    isActive(): boolean {
      return list().some((it) => {
        const st = states.get(it.id);
        return !!st && (st.progress > 0 || st.seed !== undefined || st.head !== undefined || st.value !== undefined);
      });
    },
    reset() {
      states.clear();
    },
  };
}

/** toggle: invierte el estado del efecto (encendido ↔ apagado). */
function toggleEnabled(scene: SceneV2, nodeId: string, modifier: string | undefined) {
  const find = (nodes: SceneNode[]): SceneNode | null => {
    for (const n of nodes) {
      if (n.id === nodeId) return n;
      if (n.kind === 'group') {
        const r = find(n.children);
        if (r) return r;
      }
    }
    return null;
  };
  const n = find(scene.objects);
  const walk = (list: SceneNode['stack']): boolean => {
    for (const m of list) {
      if (m.id === modifier) {
        m.enabled = m.enabled === false;
        return true;
      }
      if (m.children && walk(m.children)) return true;
    }
    return false;
  };
  if (n) walk(n.stack);
}

/** La forma: el id del objeto de la escena (data-node) de un elemento. */
const nodeOfEl = (el: EventTarget | null) => ((el as Element | null)?.closest?.('[data-node]')?.getAttribute('data-node')) ?? null;
const nodeOf = (e: Event) => nodeOfEl(e.target);

/**
 * Reproduce una escena en un <svg>: su línea de tiempo (en bucle o una vez; o solo con interacciones «play»
 * si no tiene autoplay) y sus interacciones. Con «reducir movimiento», sin transiciones: todo salta a su final.
 * La línea de tiempo avanza a los fps de la escena (por defecto, 30): en una pantalla de 120 Hz no se
 * calcula cuatro veces el mismo fotograma. `onFrame` recibe lo que tardó cada fotograma calculado (para medir).
 */
export interface PlayerOptions {
  onFrame?: (info: { ms: number; t: number }) => void;
}

export function createPlayer(engine: Engine, svg: SVGSVGElement, scene: SceneV2, options: PlayerOptions = {}) {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const inter = createInteractions(() => scene);
  const anim = scene.animation?.tracks.length ? scene.animation : null;
  const autoplay = !!anim && anim.autoplay !== false;
  const live = engine.mount(svg, anim ? sampleScene(scene, reduce && autoplay ? anim.duration : 0) : scene);
  const t0 = performance.now();
  let last = t0;
  let frame = 0;
  const fps = anim?.fps ?? 30;
  let shown: number | null = null;
  const draw = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    const moving = inter.step(reduce ? 1e6 : dt);
    let t = 0;
    if (anim && autoplay) {
      const e = (now - t0) / 1000;
      t = reduce ? anim.duration : anim.loop === false ? Math.min(e, anim.duration) : e % anim.duration;
    }
    // Las interacciones «play» mandan sobre el cabezal mientras tengan uno.
    const head = inter.playhead();
    if (anim && head !== null) t = head;
    // Al ritmo de la escena: el instante cae en su fotograma; si es el mismo y nada más se mueve, no se pinta.
    if (anim) t = Math.min(anim.duration, Math.floor(t * fps + 1e-6) / fps);
    if (t !== shown || moving) {
      const c0 = performance.now();
      live.update(inter.apply(anim ? sampleScene(scene, t) : scene));
      shown = t;
      options.onFrame?.({ ms: performance.now() - c0, t });
    }
    const keepGoing = (autoplay && !reduce && (anim!.loop !== false || t < anim!.duration)) || moving;
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
  // «pointer»: dónde está el puntero, en las coordenadas del documento (las del viewBox del <svg>).
  const move = (e: PointerEvent) => {
    const m = svg.getScreenCTM?.();
    if (!m) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    inter.pointer([p.x, p.y], live.doc());
    wake();
  };
  const out = () => {
    inter.pointer(null, null);
    wake();
  };
  // «enter»: cuando el dibujo entra en pantalla (cada vez que vuelve a entrar).
  let io: IntersectionObserver | null = null;
  const list = scene.interactions ?? [];
  if (list.length) {
    svg.addEventListener('pointerover', enter);
    svg.addEventListener('pointerout', leave);
    svg.addEventListener('click', click);
    if (list.some((it) => it.trigger === 'pointer')) {
      svg.addEventListener('pointermove', move);
      svg.addEventListener('pointerleave', out);
    }
    // Que se note que se puede tocar.
    for (const it of list) if (it.trigger !== 'enter' && it.trigger !== 'pointer') for (const el of svg.querySelectorAll(`[data-node]`)) if (el.getAttribute('data-node') === it.node) (el as SVGElement).style.cursor = 'pointer';
    if (list.some((it) => it.trigger === 'enter')) {
      if (typeof IntersectionObserver === 'function') {
        io = new IntersectionObserver((entries) => {
          if (entries.some((x) => x.isIntersecting)) {
            inter.event('view', null);
            wake();
          }
        }, { threshold: 0.3 });
        io.observe(svg);
      } else inter.event('view', null);
    }
  }
  wake();
  return {
    /** Vuelve a pintar (si un script ha cambiado la escena). */
    refresh: wake,
    stop() {
      cancelAnimationFrame(frame);
      io?.disconnect();
      svg.removeEventListener('pointerover', enter);
      svg.removeEventListener('pointerout', leave);
      svg.removeEventListener('click', click);
      svg.removeEventListener('pointermove', move);
      svg.removeEventListener('pointerleave', out);
    },
  };
}
