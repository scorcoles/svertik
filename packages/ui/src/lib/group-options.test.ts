import { describe, expect, it } from 'vitest';
import { groupOptions } from './types';

describe('groupOptions', () => {
  it('puts each layer under one heading, with ids as values', () => {
    expect(groupOptions([
      { id: 'a', label: 'Dot', group: 'Top' },
      { id: 'b', label: 'Ring', group: 'Top' },
      { id: 'c', label: 'Dot', group: 'Back' },
    ])).toEqual([
      { group: 'Top', options: [{ value: 'a', label: 'Dot' }, { value: 'b', label: 'Ring' }] },
      { group: 'Back', options: [{ value: 'c', label: 'Dot' }] },
    ]);
  });
  it('numbers repeated names only within the same layer', () => {
    expect(groupOptions([{ id: 'a', label: 'Dot' }, { id: 'b', label: 'Dot' }])).toEqual([
      { value: 'a', label: 'Dot' },
      { value: 'b', label: 'Dot (2)' },
    ]);
  });
});
