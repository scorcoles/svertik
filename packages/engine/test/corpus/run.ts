// The engine test bench: a set of scenes and a way to play each one.
//
// Two things matter here:
//
// 1. **A playback, not a single frame.** The engine is not idempotent: the same scene gives a
//    different result depending on what was evaluated before (dependencies between objects are
//    resolved over several passes, using the previous frame). The corpus reference is therefore
//    the whole sequence of frames, in order.
//
// 2. **A summary per frame** (a hash) plus the full SVG of a few. The hash flags any change;
//    the full SVGs show which.
//
// The corpus does not decide what is correct: it only pins what the engine does today, so a
// change can be measured (and accepted or rejected by eye).

import { builtins, createEngine } from '../../src';
import { sampleScene } from '../../src/animation';
import type { SceneV1 } from '../../src/scene';

export interface CorpusCase {
  /** The case name (and its entry in the golden file). */
  id: string;
  scene: SceneV1;
  /** Fotogramas por vuelta. */
  frames?: number;
  /** Laps to play: the second one checks the animation loop. */
  laps?: number;
  /** Frames per second it plays at. */
  fps?: number;
}

export interface CorpusFrame {
  lap: number;
  t: number;
  /** Hash of the SVG (and its size in bytes). */
  digest: string;
  bytes: number;
  /** How long that frame took to evaluate. */
  ms: number;
}

export interface CorpusResult {
  id: string;
  frames: CorpusFrame[];
  /** Total time of all the frames. */
  ms: number;
  /** The frames of the last lap: the steady state (the engine warmed up). */
  steadyMs: number;
}

/** Hash of a text (32-bit FNV-1a, hex). */
export function digestOf(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** The playback times: the laps and, in each, the frames. */
export function timesOf(c: CorpusCase): { lap: number; t: number }[] {
  const fps = c.fps ?? 30;
  const frames = c.frames ?? 24;
  const laps = c.laps ?? 2;
  const duration = c.scene.animation?.duration ?? 1;
  const out: { lap: number; t: number }[] = [];
  for (let lap = 0; lap < laps; lap++) {
    for (let i = 0; i < frames; i++) {
      // As the player does: time wraps around when the animation ends.
      const t = (lap * duration + i / fps) % (duration || 1);
      out.push({ lap, t });
    }
  }
  return out;
}

/** Plays a case and returns what it did on each frame. */
export function runCase(c: CorpusCase): CorpusResult {
  const engine = createEngine(builtins);
  const frames: CorpusFrame[] = [];
  for (const { lap, t } of timesOf(c)) {
    const t0 = performance.now();
    const svg = engine.toSVG(sampleScene(c.scene, t));
    const ms = performance.now() - t0;
    frames.push({ lap, t, digest: digestOf(svg), bytes: svg.length, ms });
  }
  const last = frames.length ? frames[frames.length - 1]!.lap : 0;
  return {
    id: c.id,
    frames,
    ms: frames.reduce((a, f) => a + f.ms, 0),
    steadyMs: frames.filter((f) => f.lap === last).reduce((a, f) => a + f.ms, 0),
  };
}

/** Reproduce todos los casos. */
export function runCorpus(cases: CorpusCase[]): CorpusResult[] {
  return cases.map(runCase);
}

/** A result summary: one line per case. */
export function summarise(results: CorpusResult[]): string {
  const rows = results.map((r) => {
    const last = r.frames.length ? r.frames[r.frames.length - 1]!.lap : 0;
    const first = r.frames.filter((f) => f.lap === 0);
    const steady = r.frames.filter((f) => f.lap === last);
    const avg = (fs: CorpusFrame[]) => (fs.length ? fs.reduce((a, f) => a + f.ms, 0) / fs.length : 0);
    return `${r.id.padEnd(22)} ${avg(first).toFixed(2).padStart(8)} ms/foto (1ª vuelta)   ${avg(steady).toFixed(2).padStart(8)} ms/foto (estable)`;
  });
  return rows.join('\n');
}
