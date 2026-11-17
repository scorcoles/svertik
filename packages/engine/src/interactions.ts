import { createMouseInstances, type MouseEventKind } from './mouse';
import { neutralPointer, neutralRuntime, sceneDuration, VIEWPORT_ASPECT, viewportFit, type ScenePointer, type SceneRuntime } from './scene';
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
import { sceneHasExpressions } from './expression';
import type { DocumentResult, SceneNode, SceneV1 } from './document';
import { apply as applyMat, invert } from './matrix';
import type { Engine } from './engine';
import { restorePacks } from './pack';
import { mountCanvas, type Renderer } from './canvas';

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
function restOf(scene: SceneV1, it: Interaction): unknown {
  if (it.target.on === 'node' && it.target.param === 'position') {
    return [Number(readTarget(scene, { ...it.target, param: 'x' }) ?? 0), Number(readTarget(scene, { ...it.target, param: 'y' }) ?? 0)];
  }
  return readTarget(scene, it.target);
}
function writeFollow(scene: SceneV1, it: Interaction, v: unknown) {
  if (it.target.on === 'node' && it.target.param === 'position' && Array.isArray(v)) {
    writeTarget(scene, { ...it.target, param: 'x' }, v[0]);
    writeTarget(scene, { ...it.target, param: 'y' }, v[1]);
  } else writeTarget(scene, it.target, v);
}
const isPair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number');

/** State of a scene's interactions: it is told about events and gives the scene of the moment. */
export function createInteractions(getScene: () => SceneV1) {
  const states = new Map<string, State>();
  const parents = () => {
    const map = new Map<string, string | null>();
    const walk = (nodes: SceneNode[], parent: string | null) => {
      for (const n of nodes) {
        map.set(n.id, parent);
        if (n.children?.length) walk(n.children, n.id);
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
    apply(scene: SceneV1): SceneV1 {
      const touched = list().filter((it) => {
        const st = states.get(it.id);
        if (!st) return false;
        const act = actionOf(it);
        return act === 'seed' ? st.seed !== undefined : act === 'play' ? false : act === 'follow' ? st.value !== undefined : st.progress > 0;
      });
      if (!touched.length) return scene;
      const out = scene === getScene() ? (structuredClone(scene) as SceneV1) : scene;
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
function toggleEnabled(scene: SceneV1, nodeId: string, modifier: string | undefined) {
  const find = (nodes: SceneNode[]): SceneNode | null => {
    for (const n of nodes) {
      if (n.id === nodeId) return n;
      if (n.children?.length) {
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
  if (n) walk(n.stack ?? []);
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
  /** `pointer`: the live pointer (see `pointer` below), when it is being tracked. */
  onFrame?: (info: { ms: number; t: number; pointer?: ScenePointer; runtime?: SceneRuntime; painted: 'svg' | 'canvas'; /** Shapes drawn in the frame (clones and Mouse copies included). */ shapes: number }) => void;
  /**
   * Track the pointer for `onFrame` even if no formula reads `scene.mouse.*` (a debug panel does): `true`, or a
   * function that says when (it is asked on every pointer event, so a hidden panel costs no repaints). While it
   * is on, `onFrame` also gets `runtime` (frame time, scroll, density, clock).
   */
  pointer?: boolean | (() => boolean);
  /**
   * Who paints: `svg` (default, live SVG elements), `canvas` (a <canvas> inside the <svg>; frames with
   * filters or masks still go to SVG) or `auto` (canvas only for frames with many shapes).
   */
  renderer?: Renderer;
}

export function createPlayer(engine: Engine, svg: SVGSVGElement, scene: SceneV1, options: PlayerOptions = {}) {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Packs saved without their geometry get it back once, here, instead of on every frame.
  restorePacks(scene, (s) => engine.evaluateDocument(s));
  const inter = createInteractions(() => scene);
  const mouse = createMouseInstances(scene);
  let mouseDirty = false;
  // `scene.mouse.*` formulas: the pointer is tracked only when the scene reads it, and repaints when it moves.
  const usesPointer = /scene\.mouse\./.test(JSON.stringify(scene));
  /** Is the pointer being followed right now (a formula reads it, or the host asked for it)? */
  const hostWants = () => (typeof options.pointer === 'function' ? options.pointer() : !!options.pointer);
  const wantsPointer = () => usesPointer || hostWants();
  const sceneText = JSON.stringify(scene);
  const usesClickMs = /scene\.mouse\.clickMs/.test(sceneText);
  // `scene.dt`, `scene.scroll`, `scene.pixelRatio`, `scene.clock.*`: supplied by the player each frame it is used.
  const usesClock = /scene\.clock\./.test(sceneText), usesScroll = /scene\.scroll/.test(sceneText);
  const usesRuntime = /scene\.(dt|scroll|pixelRatio|clock\.)/.test(sceneText);
  const wantsRuntime = () => usesRuntime || hostWants();
  const runtimeNow: SceneRuntime = neutralRuntime(scene);
  let clickAt = 0;
  const pointerNow: ScenePointer = neutralPointer(scene);
  let pointerDirty = false;
  let downAt = 0;
  let lastMoveAt = 0;
  let lastPos: [number, number] | null = null;
  /** Velocity or a held button keep changing without events: the loop must keep painting. */
  const pointerBusy = () => wantsPointer() && (pointerNow.down === 1 || Math.abs(pointerNow.velX) > 0 || Math.abs(pointerNow.velY) > 0 || (pointerNow.clicks > 0 && (usesClickMs || hostWants())));
  /** Values that change every frame by themselves: the real clock. */
  const runtimeBusy = () => usesClock || (hostWants() && wantsRuntime());
  const anim = scene.animation?.infinite || scene.animation?.tracks.length || sceneHasExpressions(scene)
    ? scene.animation ?? { duration: sceneDuration(scene), loop: true, fps: 30, tracks: [] }
    : null;
  const autoplay = !!anim && anim.autoplay !== false;
  const originalAspectRatio = svg.getAttribute('preserveAspectRatio');
  const fit = viewportFit(scene);
  if (fit) svg.setAttribute('preserveAspectRatio', VIEWPORT_ASPECT[fit]);
  const renderer = options.renderer ?? 'svg';
  const first = anim ? sampleScene(scene, reduce && autoplay ? anim.duration : 0) : scene;
  const live: { update(s: SceneV1): void; doc(): DocumentResult | null; onCanvas?(): boolean; hit?(x: number, y: number): string | null; surface?(): HTMLCanvasElement | null; renderer?(): Renderer; setRenderer?(r: Renderer): void; destroy?(): void } =
    // Without a renderer option: the plain SVG mount. With one (even `svg`), the switchable one.
    options.renderer === undefined ? engine.mount(svg, first) : mountCanvas(engine, svg, first, renderer);
  // Clip to the document: nothing outside it shows in Play (the stage lets drawing overflow, and Contain
  // leaves bands). A CSS inset on the <svg>, in its own pixels, from where the viewBox lands on screen; it
  // follows resizes and a changing viewBox. The canvas renderer already stops at the viewBox.
  const originalClip = svg.style.clipPath;
  let clipKey = '';
  const clipToDocument = () => {
    if (!scene.clipToDocument || typeof svg.getScreenCTM !== 'function') return;
    const vb = svg.viewBox?.baseVal;
    const m = svg.getScreenCTM();
    const r = svg.getBoundingClientRect();
    if (!vb || !m || !r.width || !r.height) return;
    const x0 = m.a * vb.x + m.c * vb.y + m.e - r.left, y0 = m.b * vb.x + m.d * vb.y + m.f - r.top;
    const x1 = m.a * (vb.x + vb.width) + m.c * (vb.y + vb.height) + m.e - r.left, y1 = m.b * (vb.x + vb.width) + m.d * (vb.y + vb.height) + m.f - r.top;
    const px = (v: number) => `${Math.round(v * 100) / 100}px`;
    const key = `inset(${px(Math.min(y0, y1))} ${px(r.width - Math.max(x0, x1))} ${px(r.height - Math.max(y0, y1))} ${px(Math.min(x0, x1))})`;
    if (key !== clipKey) svg.style.clipPath = clipKey = key;
  };
  let lastViewBox = svg.getAttribute('viewBox');
  const resized = typeof ResizeObserver === 'function' && scene.clipToDocument ? new ResizeObserver(clipToDocument) : null;
  resized?.observe(svg);
  if (scene.clipToDocument && typeof window !== 'undefined') window.addEventListener('resize', clipToDocument);
  clipToDocument();
  /** The object under the pointer: the DOM knows it for SVG frames; the canvas tests its paths. */
  const nodeAt = (e: MouseEvent) => (live.onCanvas?.() ? live.hit!(e.clientX, e.clientY) : nodeOf(e));
  const t0 = performance.now();
  let last = t0;
  let frame = 0;
  const fps = anim?.fps ?? 30;
  let shown: number | null = null;
  const clockAt = (now: number) => {
    let t = 0;
    if (anim && autoplay) {
      // A frame's timestamp can come from before the player started (rAF stamps the frame's start): never negative.
      const e = Math.max(0, (now - t0) / 1000);
      t = reduce ? anim.duration : anim.infinite ? e : anim.loop === false ? Math.min(e, anim.duration) : e % anim.duration;
    }
    // "play" interactions drive the playhead while they have one.
    const head = inter.playhead();
    if (anim && head !== null) t = head;
    // At the scene's pace: the time falls on its frame; if it's the same and nothing else moves, nothing is painted.
    if (anim) t = Math.min(anim.infinite ? Infinity : anim.duration, Math.floor(t * fps + 1e-6) / fps);
    return t;
  };
  const draw = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    const moving = inter.step(reduce ? 1e6 : dt);
    const t = clockAt(now);
    if (wantsRuntime()) {
      const d = new Date();
      runtimeNow.dt = Math.min(dt, 1) || runtimeNow.dt;
      runtimeNow.hour = d.getHours(); runtimeNow.minute = d.getMinutes(); runtimeNow.second = d.getSeconds() + d.getMilliseconds() / 1000;
      runtimeNow.pixelRatio = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
      const el = typeof document !== 'undefined' ? document.documentElement : null;
      runtimeNow.scroll = el && el.scrollHeight > el.clientHeight ? Math.max(0, Math.min(1, (window.scrollY || el.scrollTop) / (el.scrollHeight - el.clientHeight))) : 0;
      if (runtimeBusy()) pointerDirty = true;
    }
    if (pointerBusy()) {
      if (pointerNow.clicks > 0) pointerNow.clickMs = now - clickAt;
      // The button held, the pointer coasting to a stop: values that change between events.
      if (pointerNow.down) pointerNow.downMs = now - downAt;
      if (now - lastMoveAt > 50) {
        const decay = Math.exp(-dt / 0.1);
        pointerNow.velX = Math.abs(pointerNow.velX * decay) < 1 ? 0 : pointerNow.velX * decay;
        pointerNow.velY = Math.abs(pointerNow.velY * decay) < 1 ? 0 : pointerNow.velY * decay;
      }
      pointerDirty = true;
    }
    if (t !== shown || moving || mouseDirty || pointerDirty || mouse.active()) {
      const c0 = performance.now();
      const stepped = inter.apply(anim ? sampleScene(scene, t) : scene);
      // The pointer goes on the frame before Mouse Instances read it, and on to whatever draws it.
      const framed = mouse.apply(usesPointer || usesRuntime ? { ...stepped, ...(usesPointer ? { pointer: { ...pointerNow } } : {}), ...(usesRuntime ? { runtime: { ...runtimeNow } } : {}) } : stepped, now / 1000);
      live.update(framed);
      if (scene.clipToDocument && svg.getAttribute('viewBox') !== lastViewBox) { lastViewBox = svg.getAttribute('viewBox'); clipToDocument(); }
      mouseDirty = false;
      pointerDirty = false;
      shown = t;
      options.onFrame?.({ ms: performance.now() - c0, t, painted: live.onCanvas?.() ? 'canvas' : 'svg', shapes: live.doc()?.geometry.shapes?.length ?? 0, ...(wantsPointer() ? { pointer: { ...pointerNow } } : {}), ...(wantsRuntime() ? { runtime: { ...runtimeNow } } : {}) });
    }
    const keepGoing = (autoplay && !reduce && (anim!.infinite || anim!.loop !== false || t < anim!.duration)) || moving || mouse.active() || pointerBusy() || runtimeBusy();
    frame = keepGoing ? requestAnimationFrame(draw) : 0;
  };
  const wake = () => {
    if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(draw);
    }
  };
  const enter = (e: Event) => {
    if (live.onCanvas?.()) return;
    inter.event('enter', nodeOf(e));
    wake();
  };
  // On leaving a shape, what matters is where the pointer goes (another shape of the same object, or nothing).
  const leave = (e: PointerEvent) => {
    if (live.onCanvas?.()) return;
    inter.event('leave', nodeOfEl(e.relatedTarget));
    wake();
  };
  const click = (e: MouseEvent) => {
    inter.event('click', nodeAt(e));
    wake();
  };
  // On the canvas there are no elements to enter or leave: the pointer's moves say which object it is over.
  const touchable = new Set((scene.interactions ?? []).filter((it) => it.trigger !== 'enter' && it.trigger !== 'pointer').map((it) => it.node));
  let hovered: string | null = null;
  const hoverCanvas = (e: PointerEvent) => {
    if (!live.onCanvas?.()) return;
    const n = live.hit!(e.clientX, e.clientY);
    if (n === hovered) return;
    hovered = n;
    inter.event('leave', n);
    if (n) inter.event('enter', n);
    const surface = live.surface?.();
    if (surface) surface.style.cursor = n && touchable.has(n) ? 'pointer' : '';
    wake();
  };
  const leaveCanvas = () => {
    if (!live.onCanvas?.() || hovered === null) return;
    hovered = null;
    inter.event('leave', null);
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
  /** `scene.mouse.*`: position (scene coordinates and 0–1 across the viewBox), speed, button and how long it was held. */
  const updatePointer = (e: MouseEvent) => {
    const m = svg.getScreenCTM?.();
    if (!m) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const now = performance.now();
    if (lastPos && now > lastMoveAt) {
      const dt = (now - lastMoveAt) / 1000;
      // A smoothed speed; a long pause means the pointer came back from somewhere else, not a fast move.
      if (dt < 0.2) {
        const k = 1 - Math.exp(-dt / 0.04);
        pointerNow.velX += ((p.x - lastPos[0]) / dt - pointerNow.velX) * k;
        pointerNow.velY += ((p.y - lastPos[1]) / dt - pointerNow.velY) * k;
      } else { pointerNow.velX = 0; pointerNow.velY = 0; }
    }
    lastPos = [p.x, p.y];
    lastMoveAt = now;
    const [vx, vy, vw, vh] = live.doc()?.geometry.viewBox ?? [0, 0, 1, 1];
    pointerNow.posX = p.x;
    pointerNow.posY = p.y;
    pointerNow.fracX = (p.x - vx) / (vw || 1);
    pointerNow.fracY = (p.y - vy) / (vh || 1);
    const down = e.buttons & 1 ? 1 : 0;
    if (down && !pointerNow.down) downAt = now;
    if (down || pointerNow.down) pointerNow.downMs = now - downAt;
    pointerNow.down = down;
    pointerNow.rightDown = e.buttons & 2 ? 1 : 0;
    pointerNow.middleDown = e.buttons & 4 ? 1 : 0;
    pointerNow.inside = 1;
    if (wantsPointer()) pointerDirty = true;
  };
  const trackPointer = (e: PointerEvent) => { updatePointer(e); if (wantsPointer()) wake(); };
  const leavePointer = () => {
    if (pointerNow.down) pointerNow.downMs = performance.now() - downAt;
    pointerNow.inside = 0;
    pointerNow.down = 0;
    pointerNow.rightDown = 0;
    pointerNow.middleDown = 0;
    if (wantsPointer()) { pointerDirty = true; wake(); }
  };
  const countClick = (e: MouseEvent) => {
    if (e.button !== 0) return;
    pointerNow.clicks++;
    pointerNow.clickMs = 0;
    clickAt = performance.now();
    if (wantsPointer()) { pointerDirty = true; wake(); }
  };
  const countWheel = (e: WheelEvent) => {
    pointerNow.wheel += e.deltaY / 100;
    if (wantsPointer()) { pointerDirty = true; wake(); }
  };
  const scrolled = () => { if (usesScroll || hostWants()) { pointerDirty = true; wake(); } };
  const emit = (kind: MouseEventKind, e: MouseEvent) => {
    const m = svg.getScreenCTM?.();
    if (!m) return false;
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const now = performance.now();
    // Mouse Instance formulas read scene.mouse.* at this event: bring it up to date first.
    if (usesPointer) updatePointer(e);
    const handled = mouse.event(kind, [q.x, q.y], now / 1000, e.buttons, clockAt(now), live.doc(), usesPointer ? { ...pointerNow } : undefined);
    if (handled) { mouseDirty = true; wake(); }
    return handled;
  };
  const mouseClick = (e: MouseEvent) => { emit('click', e); };
  const mouseDouble = (e: MouseEvent) => { emit('double-click', e); };
  const mouseContext = (e: MouseEvent) => { if (emit('right-click', e)) e.preventDefault(); };
  const mouseMiddle = (e: MouseEvent) => { if (e.button === 1 && emit('middle-click', e)) e.preventDefault(); };
  const mouseMove = (e: PointerEvent) => { emit('move', e); };
  const mouseWheel = (e: WheelEvent) => { if (e.deltaY && emit(e.deltaY < 0 ? 'wheel-up' : 'wheel-down', e)) e.preventDefault(); };
  if (mouse.enabled) {
    svg.addEventListener('click', mouseClick);
    svg.addEventListener('dblclick', mouseDouble);
    svg.addEventListener('contextmenu', mouseContext);
    svg.addEventListener('mousedown', mouseMiddle);
    svg.addEventListener('pointermove', mouseMove);
    svg.addEventListener('wheel', mouseWheel, { passive: false });
  }
  if (typeof window !== 'undefined' && (usesScroll || options.pointer)) window.addEventListener('scroll', scrolled, { passive: true });
  if (usesPointer || options.pointer) {
    svg.addEventListener('pointermove', trackPointer);
    svg.addEventListener('pointerdown', trackPointer);
    svg.addEventListener('pointerup', trackPointer);
    svg.addEventListener('pointerleave', leavePointer);
    svg.addEventListener('click', countClick);
    svg.addEventListener('wheel', countWheel, { passive: true });
  }
  // "enter": when the drawing scrolls into view (every time it comes back).
  let io: IntersectionObserver | null = null;
  const list = scene.interactions ?? [];
  if (list.length) {
    svg.addEventListener('pointerover', enter);
    svg.addEventListener('pointerout', leave);
    svg.addEventListener('click', click);
    if (options.renderer !== undefined) {
      svg.addEventListener('pointermove', hoverCanvas);
      svg.addEventListener('pointerleave', leaveCanvas);
    }
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
    /** The chosen renderer (see `PlayerOptions.renderer`). */
    renderer: (): Renderer => live.renderer?.() ?? 'svg',
    /**
     * Switches renderer while playing. A player created with `svg` (plain SVG mount) cannot switch:
     * it returns false. Create it with `auto` or `canvas` to allow it.
     */
    setRenderer(next: Renderer): boolean {
      if (!live.setRenderer) return false;
      live.setRenderer(next);
      shown = null;
      wake();
      return true;
    },
    stop() {
      cancelAnimationFrame(frame);
      io?.disconnect();
      resized?.disconnect();
      if (scene.clipToDocument) {
        if (typeof window !== 'undefined') window.removeEventListener('resize', clipToDocument);
        svg.style.clipPath = originalClip;
      }
      mouse.clear();
      if (fit) {
        if (originalAspectRatio === null) svg.removeAttribute('preserveAspectRatio');
        else svg.setAttribute('preserveAspectRatio', originalAspectRatio);
      }
      svg.removeEventListener('pointermove', trackPointer);
      svg.removeEventListener('pointerdown', trackPointer);
      svg.removeEventListener('pointerup', trackPointer);
      svg.removeEventListener('pointerleave', leavePointer);
      svg.removeEventListener('click', countClick);
      svg.removeEventListener('wheel', countWheel);
      if (typeof window !== 'undefined') window.removeEventListener('scroll', scrolled);
      svg.removeEventListener('click', mouseClick);
      svg.removeEventListener('dblclick', mouseDouble);
      svg.removeEventListener('contextmenu', mouseContext);
      svg.removeEventListener('mousedown', mouseMiddle);
      svg.removeEventListener('pointermove', mouseMove);
      svg.removeEventListener('wheel', mouseWheel);
      svg.removeEventListener('pointerover', enter);
      svg.removeEventListener('pointerout', leave);
      svg.removeEventListener('click', click);
      svg.removeEventListener('pointermove', move);
      svg.removeEventListener('pointerleave', out);
      svg.removeEventListener('pointermove', hoverCanvas);
      svg.removeEventListener('pointerleave', leaveCanvas);
      live.destroy?.();
    },
  };
}
