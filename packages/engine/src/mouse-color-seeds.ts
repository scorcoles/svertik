import type { ModifierInstance } from './engine';

/** Runtime color seeds: Palette per input event, Random per generated copy; does not mutate authored effects. */
export function seedMouseColors(stack: ModifierInstance[], eventSalt: number | undefined, sceneSeed = 1, randomSalt = 0): ModifierInstance[] {
  if (eventSalt === undefined) return stack;
  return stack.map(m => {
    const palette = m.type === 'color' && m.params?.mode === 'palette' && m.params.paletteMode !== 'index';
    const varying = m.type === 'color' && m.params?.mode === 'random';
    const salt = varying ? randomSalt : eventSalt;
    const seed = Number.isFinite(Number(m.params?.seed)) ? Number(m.params?.seed) : 1;
    return {
      ...m,
      ...(palette || varying ? { params: { ...m.params, seed: (seed >>> 0) ^ Math.imul(salt, 0x9e3779b9) ^ Math.imul(sceneSeed, 0x85ebca6b) } } : {}),
      ...(m.children ? { children: seedMouseColors(m.children, eventSalt, sceneSeed, randomSalt) } : {}),
    };
  });
}
