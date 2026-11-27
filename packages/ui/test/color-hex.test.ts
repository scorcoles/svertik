import { describe, expect, it } from 'vitest';
import { hexPattern, joinHex, normalizeTyped, splitHex } from '../src/lib/color-hex';

describe('color-hex', () => {
  it('splits rgb and alpha from every hex form', () => {
    expect(splitHex('#ff000080')).toEqual({ rgb: '#ff0000', a: 128 / 255 });
    expect(splitHex('#F00')).toEqual({ rgb: '#ff0000', a: 1 });
    expect(splitHex('f008')).toEqual({ rgb: '#ff0000', a: 0x88 / 255 });
    expect(splitHex('nope')).toEqual({ rgb: '#000000', a: 1 });
  });
  it('writes the alpha only when translucent', () => {
    expect(joinHex('#ff0000', 1)).toBe('#ff0000');
    expect(joinHex('#ff0000', 0.5)).toBe('#ff000080');
    expect(joinHex('#ff000080', 0)).toBe('#ff000000');
  });
  it('normalises typed colours, dropping alpha where it is not allowed', () => {
    expect(normalizeTyped('#ABCDEFFF')).toBe('#abcdef');
    expect(normalizeTyped('#abcdef80')).toBe('#abcdef80');
    expect(normalizeTyped('#abcdef80', false)).toBe('#abcdef');
    expect(hexPattern(false).test('#abcdef80')).toBe(false);
    expect(hexPattern().test('#abcdef80')).toBe(true);
  });
});
