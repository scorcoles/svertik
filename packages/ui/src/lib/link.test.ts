import { describe, expect, it } from 'vitest';
import { proportional } from './link';

describe('valores enlazados', () => {
  it('the other changes in the same proportion', () => {
    expect(proportional([160, 120], 0, 320)).toEqual([320, 240]);
    expect(proportional([160, 120], 1, 60)).toEqual([80, 60]);
  });
  it('from 0 there is no proportion: the other takes the same value', () => {
    expect(proportional([0, 5], 0, 10)).toEqual([10, 10]);
  });
});
