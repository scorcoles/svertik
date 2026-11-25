// seedOnLoad: each Play load draws its own seed; without it, every load is the same.
import { describe, expect, it, vi } from 'vitest';
import { builtins, createEngine, createPlayer, validateScene, type SceneV1 } from '../src';

const scene = (seedOnLoad?: boolean): SceneV1 => ({
  version: 1, document: { width: 400, height: 400 }, seedGenerator: 7, ...(seedOnLoad ? { seedOnLoad } : {}),
  objects: [{ kind: 'shape', id: 'r', name: 'R', shape: 'rectangle', params: { width: { $expr: 'random(10, 300)', fallback: 20 }, height: 20 }, stack: [] }],
});

function load(s: SceneV1, roll: number): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(Math, 'random').mockReturnValue(roll);
  try {
    const player = createPlayer(createEngine(builtins), svg, s);
    const drawn = svg.innerHTML;
    player.stop();
    return drawn;
  } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); }
}

describe('seedOnLoad', () => {
  it('draws a new seed per load, and leaves the stored scene alone', () => {
    const s = scene(true);
    expect(load(s, 0.1)).not.toBe(load(s, 0.7));
    expect(s.seedGenerator).toBe(7);
  });
  it('without it, every load is the same', () => {
    expect(load(scene(), 0.1)).toBe(load(scene(), 0.7));
  });
  it('validates', () => {
    expect(validateScene({ ...scene(), seedOnLoad: 1 }).errors).toContain('seedOnLoad must be true or false');
  });
});
