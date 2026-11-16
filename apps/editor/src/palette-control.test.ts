import { expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { ParamControl } from '@svertik/ui';

it.each(['edit', 'add', 'remove'])('supports palette %s with the existing color controls', async action => {
  let colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'];
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(ParamControl, { target, props: { name: 'palette', spec: { type: 'palette', default: colors, label: 'Colors' }, value: colors, onchange: value => { colors = value as string[]; } } });
  try {
    flushSync();
    expect(target.querySelectorAll('input[aria-label^="Palette color"]')).toHaveLength(5);
    if (action === 'edit') {
      const field = target.querySelector<HTMLInputElement>('input[aria-label="Palette color 1"]')!;
      field.focus(); field.value = '#abc'; field.dispatchEvent(new Event('input', { bubbles: true })); field.blur(); flushSync();
      expect(colors[0]).toBe('#aabbcc');
    } else if (action === 'add') {
      target.querySelector<HTMLButtonElement>('button[aria-label="Add palette color"]')!.click(); flushSync();
      expect(colors).toHaveLength(6);
    } else {
      target.querySelector<HTMLButtonElement>('button[aria-label="Remove palette color 1"]')!.click(); flushSync();
      expect(colors).toHaveLength(4);
    }
  } finally { await unmount(component); target.remove(); }
});
