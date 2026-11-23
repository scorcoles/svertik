import { describe, expect, it } from 'vitest';
import { decimalsOf, formatNumber, nudge, parseNumber, scrub } from '../src/lib/scrub';

describe('scrub', () => {
  it('one step every 2 px by default', () => {
    expect(scrub(0, 10, { step: 0.01 })).toBe(0.05);
    expect(scrub(0, -10, { step: 1 })).toBe(-5);
  });
  it('shift ×10, alt ×0.1', () => {
    expect(scrub(0, 2, { step: 1, coarse: true })).toBe(10);
    expect(scrub(0, 2, { step: 1, fine: true })).toBe(0.1);
  });
  it('respects minimum and maximum', () => {
    expect(scrub(0.9, 100, { step: 0.01, max: 1 })).toBe(1);
    expect(scrub(0.1, -100, { step: 0.01, min: 0 })).toBe(0);
  });
  it('no floating-point noise', () => {
    expect(scrub(0.1, 4, { step: 0.1 })).toBe(0.3);
  });
});

describe('nudge', () => {
  it('suma o resta un paso, redondeado', () => {
    expect(nudge(0.1, 1, { step: 0.1 })).toBe(0.2);
    expect(nudge(0.3, -1, { step: 0.1 })).toBe(0.2);
    expect(nudge(1, 1, { step: 1, fine: true })).toBe(1.1);
  });
});

describe('parseNumber y formatNumber', () => {
  it('accepts a decimal comma and rejects what is not a number', () => {
    expect(parseNumber('0,5')).toBe(0.5);
    expect(parseNumber(' -2 ')).toBe(-2);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });
  it('formats with the step\'s decimals', () => {
    expect(decimalsOf(0.01)).toBe(2);
    expect(decimalsOf(1)).toBe(0);
    expect(decimalsOf(1e-7)).toBe(7);
    expect(formatNumber(0.5, 0.01)).toBe('0.50');
  });
});
