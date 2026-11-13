// El banco de pruebas del motor: un conjunto de escenas y una forma de reproducir cada una.
//
// Dos cosas importan aquí:
//
// 1. **Una reproducción, no un fotograma suelto.** El motor no es idempotente: la misma escena
//    da un resultado distinto según lo que se evaluó antes (las dependencias entre objetos se
//    resuelven en varias pasadas, usando el fotograma anterior). La referencia del corpus es,
//    por tanto, la secuencia completa de fotogramas, en orden.
//
// 2. **Un resumen por fotograma** (huella) más los SVG completos de unos pocos. La huella avisa
//    de cualquier cambio; los SVG completos dejan ver cuál.
//
// El corpus no decide qué es correcto: solo fija lo que el motor hace hoy, para que un cambio
// pueda medirse (y aceptarse o rechazarse a ojo).

import { builtins, createEngine } from '../../src';
import { sampleScene } from '../../src/animation';
import type { SceneV2 } from '../../src/scene';

export interface CorpusCase {
  /** Nombre del caso (y de su huella en el fichero dorado). */
  id: string;
  scene: SceneV2;
  /** Fotogramas por vuelta. */
  frames?: number;
  /** Vueltas a dar: la segunda comprueba el bucle de la animación. */
  laps?: number;
  /** Fotogramas por segundo con los que se reproduce. */
  fps?: number;
}

export interface CorpusFrame {
  lap: number;
  t: number;
  /** Huella del SVG (y su tamaño en bytes). */
  digest: string;
  bytes: number;
  /** Cuánto tardó en evaluarse ese fotograma. */
  ms: number;
}

export interface CorpusResult {
  id: string;
  frames: CorpusFrame[];
  /** Suma de los tiempos de todos los fotogramas. */
  ms: number;
  /** Los fotogramas de la última vuelta: el estado estable (el motor ya caliente). */
  steadyMs: number;
}

/** Huella de un texto (FNV-1a de 32 bits, en hexadecimal). */
export function digestOf(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Los instantes de la reproducción: las vueltas, y en cada una, los fotogramas. */
export function timesOf(c: CorpusCase): { lap: number; t: number }[] {
  const fps = c.fps ?? 30;
  const frames = c.frames ?? 24;
  const laps = c.laps ?? 2;
  const duration = c.scene.animation?.duration ?? 1;
  const out: { lap: number; t: number }[] = [];
  for (let lap = 0; lap < laps; lap++) {
    for (let i = 0; i < frames; i++) {
      // Como el reproductor: el tiempo da la vuelta al terminar la animación.
      const t = (lap * duration + i / fps) % (duration || 1);
      out.push({ lap, t });
    }
  }
  return out;
}

/** Reproduce un caso y devuelve lo que hizo en cada fotograma. */
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

/** El resumen de un resultado: una línea por caso. */
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
