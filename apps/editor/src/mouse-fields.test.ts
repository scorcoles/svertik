import { expect, it } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import NodeAttributes from './NodeAttributes.svelte';
import { Editor } from './editor.svelte';
import { formulaEditor } from '@svertik/ui';

it('offers ƒx for Mouse numeric fields and edits independent Offset components', async () => {
  const editor = new Editor();
  editor.scene = { version: 1, objects: [
    { kind: 'instance', id: 'mouse', name: 'Mouse', of: 'source', stack: [], mouse: { event: 'move' } },
    { kind: 'shape', id: 'source', name: 'Source', shape: 'rectangle', params: {}, stack: [] },
  ] };
  editor.selected = 'mouse';
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(NodeAttributes, { target, props: { editor, node: editor.scene.objects[0]!, onreplace() {} } });
  try {
    flushSync();
    for (const field of ['Rate', 'Min distance', 'Copies / event', 'Life (0 = keep)', 'Max copies', 'Offset X', 'Offset Y', 'Scale', 'Rotation', 'Position variation', 'Scale variation', 'Rotation variation']) {
      expect(target.querySelector(`button[aria-label="Use an expression for ${field}"]`)).not.toBeNull();
    }
    target.querySelector<HTMLButtonElement>('button[aria-label="Use an expression for Offset X"]')!.click();
    flushSync();
    // Turning it into a formula opens the formula editor on it, titled with where it is.
    const button = target.querySelector<HTMLButtonElement>('button[aria-label="Edit the formula of Offset X"]')!;
    expect(button).not.toBeNull();
    expect(formulaEditor.current).toMatchObject({ owner: button, label: 'Offset X', where: ['Mouse'] });
    formulaEditor.current!.commit('random(-10, 10, scene.frame)');
    flushSync();
    expect(editor.scene.objects[0]).toMatchObject({ mouse: { offset: [{ $expr: 'random(-10, 10, scene.frame)', fallback: 0 }, 0] } });
  } finally { formulaEditor.close(); await unmount(component); target.remove(); }
});

it.each([true, false])('hides generic node actions only on Mouse Instance (mouse: %s)', async mouse => {
  const editor = new Editor();
  editor.scene = { version: 1, objects: mouse ? [{ kind: 'instance', id: 'mouse', name: 'Mouse', of: '', mouse: {}, stack: [] }] : [{ kind: 'shape', id: 'source', name: 'Source', shape: 'cross', params: {}, stack: [] }] };
  editor.selected = editor.scene.objects[0]!.id;
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(NodeAttributes, { target, props: { editor, node: editor.scene.objects[0]!, onreplace() {} } });
  try {
    flushSync();
    const sections = [...target.querySelectorAll('.sv-section-trigger')].map(n => n.textContent);
    for (const section of ['Display', 'Interactions', 'Animate']) expect(sections.some(text => text?.includes(section))).toBe(!mouse);
    const buttons = [...target.querySelectorAll('button')].map(n => n.textContent?.trim());
    for (const label of ['Pack', 'Group', 'Remove']) expect(buttons.includes(label)).toBe(!mouse);
    if (mouse) expect(target.querySelector('button[aria-label="Target"]')).not.toBeNull();
  } finally { await unmount(component); target.remove(); }
});

it('shows formulas on an object’s position, rotation and opacity instead of empty fields', async () => {
  const { formulaEditor } = await import('@svertik/ui');
  const editor = new Editor();
  editor.scene = { version: 1, objects: [
    { kind: 'shape', id: 'p', name: 'Planet', shape: 'ellipse', params: {}, stack: [], opacity: { $expr: 'scene.progress', fallback: 1 } as unknown as number,
      transform: { x: { $expr: 'scene.object.sun.x + 10', fallback: 0 } as unknown as number, y: 5, rotation: { $expr: 'scene.time * 6', fallback: 0 } as unknown as number } },
  ] };
  editor.selected = 'p';
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(NodeAttributes, { target, props: { editor, node: editor.scene.objects[0]!, onreplace() {} } });
  try {
    flushSync();
    const formula = (name: string) => target.querySelector<HTMLButtonElement>(`button[aria-label="Edit the formula of ${name}"]`);
    expect(formula('Position X')?.textContent).toBe('scene.object.sun.x + 10');
    expect(formula('Rotation')?.textContent).toBe('scene.time * 6');
    expect(formula('Opacity')?.textContent).toBe('scene.progress');
    expect(formula('Position Y')).toBeNull();
    // ƒx turns it back into its number.
    target.querySelector<HTMLButtonElement>('button[aria-label="Use a number for Rotation"]')!.click();
    flushSync();
    expect((editor.scene.objects[0] as { transform: Record<string, unknown> }).transform.rotation).toBe(0);
  } finally { formulaEditor.close(); await unmount(component); target.remove(); }
});
