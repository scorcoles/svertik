import { describe, expect, it } from 'vitest';
import { builtins, effectDescriptions, shapeDescriptions, shapes } from '../src';

describe('descripciones (para la documentación)', () => {
  it('cada efecto y cada primitiva de serie tiene la suya (y no sobra ninguna)', () => {
    expect(builtins.map((m) => m.type).filter((t) => !effectDescriptions[t])).toEqual([]);
    expect(shapes.map((s) => s.type).filter((t) => !shapeDescriptions[t])).toEqual([]);
    expect(Object.keys(effectDescriptions).filter((t) => !builtins.some((m) => m.type === t))).toEqual([]);
  });
});
