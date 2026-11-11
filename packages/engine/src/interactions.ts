// Interactions: something happens (the pointer enters or leaves an object, a click, the drawing scrolls
// into view) and svertik does something:
// - tween: a value goes to another with its duration and curve, and comes back (on leave, or the next click);
// - play: the timeline runs a segment (on enter, forwards; on leave, back; click: from the start);
// - seed: a new seed for an effect (a different Glitch or Damage on each click);
// - toggle: turns an effect on or off;
// - follow (with the "pointer" trigger): a value follows the pointer while it is over the drawing: an
//   object's position or an effect's point goes under the pointer; a number runs from `range[0]` to
//   `range[1]` depending on where the pointer is in the document (across or down). `duration`: the lag (s).
//   On leave, it goes back to its place (unless `stay`).
// `createPlayer` puts this together with the timeline: exported code and the editor's Play mode use it.
import { ease, lerpValue, readTarget, sampleScene, writeTarget, type Ease, type Track } from './animation';
import type { DocumentResult, SceneNode, SceneV2 } from './document';
import { apply as applyMat, invert } from './matrix';
import type { Engine } from './engine';

export type Trigger = 'hover' | 'click' | 'enter' | 'pointer';
export type Action = 'tween' | 'play' | 'seed' | 'toggle' | 'follow';

export interface Interaction {
  id: string;
  /** Object or group that fires it (a group, with any of its children). With "enter", the whole drawing. */
  node: string;
  trigger: Trigger;
  /** What it does (tween by default). */
  action?: Action;
  /** On what: the value (tween, seed) or the effect (toggle: node and modifier are enough). */
  target: Pick<Track, 'node' | 'on' | 'modifier' | 'param'>;
  /** tween: the value it goes to. */
  to: unknown;
  /** tween: segundos. */
  duration: number;
  ease?: Ease;
  /** play: the timeline segment, in seconds [from, to]. */
  segment?: [number, number];
  /** follow: which pointer axis counts (for a point or the position, `both`: both). */
  axis?: 'x' | 'y' | 'both';
  /** follow, on a number: the value with the pointer at one edge of the document and at the other. */
  range?: [number, number];
  /** follow: when the pointer leaves, it stays where it was (otherwise it goes back to its place). */
  stay?: boolean;
}

interface State {
  /** tween and toggle: 0 = at rest, 1 = at its target (toggle jumps). */
  progress: number;
  /** Where it is heading: 1 (to the target) or -1 (back). */
  dir: 1 | -1;
  /** seed: the seed set by the interaction. */
  seed?: number;
  /** play: the playhead and where it is heading. */
  head?: number;
  goal?: number;
  /** follow: the current value and where it is heading (`rest`: back to its place). */
  value?: unknown;
  aim?: unknown;
}

const actionOf = (it: Interaction): Action => it.action ?? 'tween';

/** follow: the value at rest (the scene's). The position, as [x, y]. */
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

/** State of a scene's interactions: it is told about events and gives the scene of the moment. */
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
  /** Is the touched object the interaction's, or inside it? */
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

  /** What an interaction does when fired (forward) or undone (pointer leaves, another click). */
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

  /** follow: where the value goes with the pointer at `q` (in the document), depending on what follows. */
  function aimOf(it: Interaction, q: [number, number], doc: DocumentResult, up: Map<string, string | null>): unknown {
    const scene = getScene();
    const rest = restOf(scene, it);
    const axis = it.axis ?? 'both';
    const keep = (p: [number, number]): [number, number] =>
      isPair(rest) ? [axis === 'y' ? rest[0] : p[0], axis === 'x' ? rest[1] : p[1]] : p;
    const t = it.target;
    if (t.on === 'node' && t.param === 'position') {
      // In its group's coordinates (if any): its centre, under the pointer.
      const parent = up.get(t.node);
      const m = parent ? doc.nodes.get(parent)?.matrix : null;
      const p = m ? applyMat(invert(m), q) : q;
      return keep([p[0], p[1]]);
    }
    if (isPair(rest)) {
      // A point of an effect (fractions of the box the effect measures on): under the pointer.
      const info = doc.nodes.get(t.node);
      if (!info) return rest;
      const box = (t.modifier && info.refs?.[t.modifier]) || info.bounds;
      const local = applyMat(invert(info.matrix), q);
      const f = (v: number, a: number, w: number) => Math.round(((v - a) / (w || 1)) * 1000) / 1000;
      return keep([f(local[0], box.x, box.width), f(local[1], box.y, box.height)]);
    }
    // A number: from range[0] to range[1] across (or down) the document.
    const [vx, vy, vw, vh] = doc.geometry.viewBox;
    const k = Math.max(0, Math.min(1, axis === 'y' ? (q[1] - vy) / (vh || 1) : (q[0] - vx) / (vw || 1)));
    const [a, b] = it.range ?? [0, 1];
    return a + (b - a) * k;
  }

  return {
    /** The pointer over the drawing (in document coordinates), or null if it left. For "follow". */
    pointer(q: [number, number] | null, doc: DocumentResult | null) {
      const up = parents();
      for (const it of list()) {
        if (it.trigger !== 'pointer' || actionOf(it) !== 'follow') continue;
        const st = stateOf(it);
        if (q && doc) st.aim = aimOf(it, q, doc, up);
        else if (!it.stay) st.aim = 'rest';
      }
    },
    /** An event on object `hit` (the id of the touched shape). "view": the drawing scrolls into view. */
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
          // Click: tween and toggle alternate; play starts over; seed, a new one each time.
          if (act === 'play' || act === 'seed') fire(it, true, true);
          else fire(it, stateOf(it).dir !== 1);
        }
      }
    },
    /** Advances `dt` seconds. Returns whether something is still moving. */
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
          // Lag: gets a little closer every frame (exponential: independent of the fps).
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
    /** The playhead "play" interactions ask for (the last one that moved), or null. */
    playhead(): number | null {
      let head: number | null = null;
      for (const it of list()) {
        const st = states.get(it.id);
        if (actionOf(it) === 'play' && st?.head !== undefined) head = st.head;
      }
      return head;
    },
    /** The scene with the interactions' values on top (a copy if needed). */
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
    /** Is any interaction away from rest? */
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

/** toggle: flips the effect's state (on ↔ off). */
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

/** The shape: the scene object id (data-node) of an element. */
const nodeOfEl = (el: EventTarget | null) => ((el as Element | null)?.closest?.('[data-node]')?.getAttribute('data-node')) ?? null;
const nodeOf = (e: Event) => nodeOfEl(e.target);

/**
 * Plays a scene in an <svg>: its timeline (looping or once; or only through "play" interactions if it
 * has no autoplay) and its interactions. With "reduced motion", no transitions: everything jumps to its end.
 * The timeline advances at the scene's fps (30 by default): on a 120 Hz screen the same frame isn't
 * computed four times. `onFrame` gets how long each computed frame took (to measure).
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
    // "play" interactions drive the playhead while they have one.
    const head = inter.playhead();
    if (anim && head !== null) t = head;
    // At the scene's pace: the time falls on its frame; if it's the same and nothing else moves, nothing is painted.
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
  // On leaving a shape, what matters is where the pointer goes (another shape of the same object, or nothing).
  const leave = (e: PointerEvent) => {
    inter.event('leave', nodeOfEl(e.relatedTarget));
    wake();
  };
  const click = (e: Event) => {
    inter.event('click', nodeOf(e));
    wake();
  };
  // "pointer": where the pointer is, in document coordinates (those of the <svg> viewBox).
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
  // "enter": when the drawing scrolls into view (every time it comes back).
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
    // Show that it can be touched.
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
    /** Paints again (if a script changed the scene). */
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
