import { describe, expect, it } from 'vitest';
import { proportional } from './link';

describe('valores enlazados', () => {
  it('el otro cambia en la misma proporción', () => {
    expect(proportional([160, 120], 0, 320)).toEqual([320, 240]);
    expect(proportional([160, 120], 1, 60)).toEqual([80, 60]);
  });
  it('desde 0 no hay proporción: el otro toma el mismo valor', () => {
    expect(proportional([0, 5], 0, 10)).toEqual([10, 10]);
  });
});
