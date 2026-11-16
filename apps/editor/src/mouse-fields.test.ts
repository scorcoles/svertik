import { expect, it } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import NodeAttributes from './NodeAttributes.svelte';
import { Editor } from './editor.svelte';

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
    const input = target.querySelector<HTMLInputElement>('input[aria-label="Offset X expression"]')!;
    expect(input).not.toBeNull();
    input.value = 'random(-10, 10, scene.frame)'; input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(editor.scene.objects[0]).toMatchObject({ mouse: { offset: [{ $expr: 'random(-10, 10, scene.frame)', fallback: 0 }, 0] } });
  } finally { await unmount(component); target.remove(); }
});
