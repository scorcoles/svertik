import { afterEach, describe, expect, it } from 'vitest';
import { expandFormula, formulaEditor, formulaField } from '@svertik/ui';
import { evaluateExpression, validateExpression } from '@svertik/engine';

describe('the formula editor', () => {
  afterEach(() => formulaEditor.close());
  const fieldWith = (value: string) => {
    const el = document.createElement('input');
    document.body.append(el);
    el.value = value;
    const commits: string[] = [];
    const action = formulaField(el, { label: 'Y', value, commit: (next) => commits.push(next) });
    return { el, commits, action };
  };

  it('opens a formula field, commits through it, and follows its value', () => {
    const { el, commits, action } = fieldWith('scene.time * 2');
    expect(expandFormula(el)).toBe(true);
    expect(formulaEditor.current).toMatchObject({ label: 'Y', value: 'scene.time * 2', template: false });
    formulaEditor.current!.commit('scene.time *\n  3');
    expect(commits).toEqual(['scene.time *\n  3']);
    // The field re-renders with the new value (or an undo): the editor shows it.
    action.update({ label: 'Y', value: 'scene.time * 3', commit: () => {} });
    expect(formulaEditor.current!.value).toBe('scene.time * 3');
  });

  it('opens with ⌘/Ctrl+Enter, and closes when its field goes away', () => {
    const { el, action } = fieldWith('1');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }));
    expect(formulaEditor.current?.owner).toBe(el);
    action.destroy();
    expect(formulaEditor.current).toBeNull();
  });

  it('does not open the editor\'s own field again', () => {
    const el = document.createElement('textarea');
    formulaField(el, { label: 'Y', noExpand: true, commit: () => {} });
    expect(expandFormula(el)).toBe(false);
  });
});

describe('long formulas over several lines', () => {
  it('parse and evaluate the same as on one line', () => {
    const source = 'clamp(\n  max(\n    1,\n    scene.time * 2\n  ),\n  0, 10\n)';
    expect(validateExpression(source)).toBeNull();
    expect(evaluateExpression(source, { time: 3, frame: 0, fps: 30, duration: 10, progress: 0, seedGenerator: 1, custom: {} })).toBe(6);
  });
  it('can be long (the lids of a grid of eyes take ~600 characters)', () => {
    expect(validateExpression(Array.from({ length: 150 }, () => 'sin(1)').join(' + '))).toBeNull();
  });
});
