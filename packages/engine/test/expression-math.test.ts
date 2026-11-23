import { describe, expect, it } from 'vitest';
import { evaluateExpression } from '../src/expression';

const ctx = { time: 0, frame: 0, fps: 30, duration: 1, progress: 0, seedGenerator: 1, custom: { a: 2 } } as never;
const ev = (e: string) => evaluateExpression(e, ctx);

describe('expression signs and angles', () => {
  it('accepts a leading or inner minus anywhere a value can go', () => {
    expect(ev('-2 * 3')).toBe(-6);
    expect(ev('-(2)')).toBe(-2);
    expect(ev('-scene.custom.a')).toBe(-2);
    expect(ev('3 * -scene.custom.a')).toBe(-6);
    expect(ev('--2')).toBe(2);
    expect(ev('-sin(0)')).toBe(-0);
  });

  it('keeps ^ above the sign, as in maths', () => {
    expect(ev('-2 ^ 2')).toBe(-4);
    expect(ev('2 ^ -1')).toBe(0.5);
  });

  it('has atan, atan2 and deg (radians to degrees)', () => {
    expect(ev('deg(atan(1))')).toBeCloseTo(45);
    expect(ev('deg(atan2(1, -1))')).toBeCloseTo(135);
    expect(ev('-deg(pi)')).toBeCloseTo(-180);
  });
});
