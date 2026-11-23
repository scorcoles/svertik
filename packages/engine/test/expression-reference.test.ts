import { describe, expect, it } from 'vitest';
import { expressionReference, validateExpression } from '../src/expression';

describe('expressionReference', () => {
  const ref = expressionReference();
  it('documents every variable and function the parser accepts', () => {
    for (const entry of [...ref.variables, ...ref.functions]) expect(entry.about, entry.name).not.toBe('');
    for (const v of ref.variables) expect(validateExpression(v.name), v.name).toBeNull();
  });
  it('lists the mouse, clock and random helpers', () => {
    const names = [...ref.variables, ...ref.functions].map((e) => e.name);
    expect(names).toContain('scene.mouse.downMs');
    expect(names).toContain('scene.clock.hour');
    expect(names).toContain('random(min, max, seed?)');
  });
});
