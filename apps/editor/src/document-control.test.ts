import { expect, it } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import DocumentAttributes from './DocumentAttributes.svelte';
import { Editor } from './editor.svelte';

it.each([false, true])('Full can be toggled by clicking in Document (fixed: %s)', async fixed => {
  const editor = new Editor();
  editor.scene = { version: 1, objects: [], ...(fixed ? { document: { width: 800, height: 600 } } : {}) };
  const target = document.createElement('div');
  document.body.append(target);
  const component = mount(DocumentAttributes, { target, props: { editor } });
  flushSync();
  try {
    const control = target.querySelector<HTMLInputElement>('#doc-full-viewport')!;
    expect(control).not.toBeNull();
    expect(control.checked).toBe(false);
    control.click();
    flushSync();
    expect(editor.scene.fullViewport).toBe(true);
    expect(control.checked).toBe(true);
    control.click();
    flushSync();
    expect(editor.scene.fullViewport).toBeUndefined();
    expect(control.checked).toBe(false);
    const labels = [...target.querySelectorAll('label')].map(n => n.textContent?.trim());
    if (fixed) expect(labels.indexOf('Full')).toBeGreaterThan(labels.indexOf('Height'));
  } finally { await unmount(component); target.remove(); }
});

import { vi } from 'vitest';
import Canvas from './Canvas.svelte';

it('Full affects only Play and preserves the editor frame, margins and bounds', async () => {
  const editor = new Editor();
  editor.scene = { version: 1, document: { width: 1920, height: 1080 }, objects: [] };
  editor.showRulers = false;
  editor.showBounds = true;
  const target = document.createElement('div');
  document.body.append(target);
  let resize: (entries: unknown[]) => void = () => {};
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: (entries: unknown[]) => void) { resize = callback; }
    observe() {}
    disconnect() {}
  });
  const doc = mount(DocumentAttributes, { target, props: { editor } });
  const canvas = mount(Canvas, { target, props: { editor, onimport() {}, onfile() {}, ondemo() {} } });
  try {
    flushSync();
    resize([{ contentRect: { width: 800, height: 600 } }]);
    flushSync();
    const input = target.querySelector<HTMLInputElement>('#doc-full-viewport')!;
    input.click();
    flushSync();
    expect(input.checked).toBe(true);
    expect(target.querySelector('svg.result')?.getAttribute('viewBox')).toBe('-960 -540 1920 1080');
    expect(target.querySelector('.bounds .frame')?.getAttribute('width')).toBe('1920');
    expect(target.querySelector('.bounds .frame')?.getAttribute('height')).toBe('1080');
    expect((target.querySelector('.view') as HTMLElement).style.inset).toBe('48px 48px 56px');
    input.click();
    flushSync();
    expect(input.checked).toBe(false);
  } finally {
    await unmount(canvas); await unmount(doc); target.remove(); vi.unstubAllGlobals();
  }
});

import Presenter from './Presenter.svelte';

// Full fits like CSS object-fit: true = contain (no distortion), cover crops, stretch distorts.
it.each([
  [false, null],
  [true, 'xMidYMid meet'],
  ['cover', 'xMidYMid slice'],
  ['stretch', 'none'],
] as const)('full-screen editor Play fits the saved frame to the viewport only with Full (%s)', async (fullViewport, aspect) => {
  const full = fullViewport !== false;
  const editor = new Editor();
  editor.scene = { version: 1, fullViewport, document: { width: 1920, height: 1080 }, objects: [] };
  const target = document.createElement('div');
  document.body.append(target);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const component = mount(Presenter, { target, props: { editor } });
  try {
    flushSync();
    const svg = target.querySelector('svg.stage')!;
    expect(svg.classList.contains('full-viewport')).toBe(full);
    expect(svg.getAttribute('preserveAspectRatio')).toBe(aspect);
    expect(svg.getAttribute('viewBox')).toBe('-960 -540 1920 1080');
  } finally { await unmount(component); target.remove(); vi.unstubAllGlobals(); }
});

it('Document labels the mode Infinite and toggles it without changing duration', async () => {
  const editor = new Editor();
  editor.scene = { version: 1, objects: [], animation: { duration: 10, loop: true, tracks: [] } };
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(DocumentAttributes, { target, props: { editor } });
  try {
    flushSync();
    const label = target.querySelector('label[for="doc-infinite-time"]')!;
    expect(label.textContent).toBe('Infinite');
    const button = target.querySelector<HTMLButtonElement>('#doc-infinite-time')!;
    button.click(); flushSync();
    expect(editor.animation).toMatchObject({ infinite: true, loop: false, duration: 10 });
    button.click(); flushSync();
    expect(editor.animation?.infinite).toBeUndefined();
    expect(editor.animation?.duration).toBe(10);
  } finally { await unmount(component); target.remove(); }
});
