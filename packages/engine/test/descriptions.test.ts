import { describe, expect, it } from 'vitest';
import { builtins, effectDescriptions, shapeDescriptions, shapes } from '../src';

describe('descriptions (for the docs)', () => {
  it('every built-in effect and primitive has one (and there are no extras)', () => {
    expect(builtins.map((m) => m.type).filter((t) => !effectDescriptions[t])).toEqual([]);
    expect(shapes.map((s) => s.type).filter((t) => !shapeDescriptions[t])).toEqual([]);
    expect(Object.keys(effectDescriptions).filter((t) => !builtins.some((m) => m.type === t))).toEqual([]);
  });
});
