import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneV1 } from '@svertik/engine/scene';
import { Editor } from './editor.svelte';
import { encodeState } from './share';

const scene = (fillColor: string): SceneV1 => ({
  version: 1,
  document: { width: 400, height: 300 },
  objects: [{ kind: 'shape', id: 'box', name: 'Box', shape: 'rectangle', params: { width: 40, height: 20, fillColor }, stack: [] }],
});
const fill = (e: Editor) => (e.scene!.objects[0] as unknown as { params: { fillColor: string } }).params.fillColor;

beforeEach(() => {
  sessionStorage.clear();
  history.replaceState(null, '', '/');
});
afterEach(async () => {
  vi.unstubAllGlobals();
  // Autosaves started without waiting (loading a scene records it) must not land in the next test's tab.
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
});

describe('session autosave', () => {
  it('keeps the work for this tab and brings it back on reload, with a clean address bar', async () => {
    const a = new Editor();
    a.scene = scene('#ff0000');
    a.name = 'Boxes';
    a.record(true);
    await a.saveSession();
    expect(location.hash).toBe('');
    expect(sessionStorage.getItem('svertik:session')).toBeTruthy();

    const reloaded = new Editor();
    expect(await reloaded.loadFromURL()).toBe(true);
    expect(fill(reloaded)).toBe('#ff0000');
    expect(reloaded.name).toBe('Boxes');
    expect(reloaded.presenting).toBe(false);
  });

  it('only the latest of overlapping autosaves is kept', async () => {
    const e = new Editor();
    e.scene = scene('#111111');
    e.record(true);
    const first = e.saveSession();
    (e.scene.objects[0] as unknown as { params: { fillColor: string } }).params.fillColor = '#222222';
    e.record(true);
    await Promise.all([first, e.saveSession()]);
    const reloaded = new Editor();
    await reloaded.loadFromURL();
    expect(fill(reloaded)).toBe('#222222');
  });

  it('opens a link from the address bar over the autosave, then clears it from the bar', async () => {
    const saved = new Editor();
    saved.scene = scene('#000000');
    saved.record(true);
    await saved.saveSession();

    history.replaceState(null, '', `/?x=1#p=${await encodeState({ scene: scene('#00ff00'), name: 'Shared' })}`);
    const e = new Editor();
    expect(await e.loadFromURL()).toBe(true);
    expect(fill(e)).toBe('#00ff00');
    expect(e.presenting).toBe(true);
    expect(location.hash).toBe('');
    expect(location.search).toBe('?x=1');
    // The shared scene is now this tab's work.
    await e.saveSession();
    const reloaded = new Editor();
    await reloaded.loadFromURL();
    expect(fill(reloaded)).toBe('#00ff00');
  });

  it('a link that cannot be opened stays in the bar and the autosave opens instead', async () => {
    const saved = new Editor();
    saved.scene = scene('#123456');
    saved.record(true);
    await saved.saveSession();
    history.replaceState(null, '', '/#s=not-a-scene');
    const e = new Editor();
    expect(await e.loadFromURL()).toBe(true);
    expect(fill(e)).toBe('#123456');
    expect(location.hash).toBe('#s=not-a-scene');
  });

  it('nothing to open: no link and no autosave', async () => {
    expect(await new Editor().loadFromURL()).toBe(false);
  });
});
