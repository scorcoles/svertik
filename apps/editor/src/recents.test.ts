// Recent scenes: what gets in (scenes with changes), how an entry follows its scene, and reopening one.
import { beforeEach, describe, expect, it } from 'vitest';
import { Editor } from './editor.svelte';
import { ago, MAX_RECENTS, memoryStore, remember, type Recent } from './recents';

/** Lets the autosaves started without waiting (record, markSaved) finish. */
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
const entry = (id: string, updated: number): Recent => ({ id, name: id, updated, state: '', saved: false });

beforeEach(() => sessionStorage.clear());

describe('the list', () => {
  it('keeps the newest ones, newest first', async () => {
    const store = memoryStore();
    for (let i = 0; i < MAX_RECENTS + 3; i++) await remember(store, entry(`s${i}`, i));
    const list = await store.list();
    expect(list).toHaveLength(MAX_RECENTS);
    expect(list[0]!.id).toBe(`s${MAX_RECENTS + 2}`);
    expect(list.some((r) => r.id === 's0')).toBe(false);
  });

  it('says how long ago', () => {
    const now = Date.UTC(2026, 10, 25, 12);
    expect(ago(now - 20_000, now)).toBe('just now');
    expect(ago(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(ago(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(ago(now - 26 * 3_600_000, now)).toBe('yesterday');
    expect(ago(now - 4 * 86_400_000, now)).toBe('4 days ago');
  });
});

describe('in the editor', () => {
  it('lists a scene once it changes, follows it and marks it saved', async () => {
    const store = memoryStore();
    const e = new Editor();
    e.recents = store;
    e.newFile(400, 300);
    await e.saveSession(); await settle();
    // Untouched: not a recent scene.
    expect(await store.list()).toEqual([]);

    e.addShape('rectangle');
    await e.saveSession(); await settle();
    let [recent] = await store.list();
    expect(recent).toMatchObject({ name: 'untitled', saved: false });

    e.markSaved(); await settle();
    [recent] = await store.list();
    expect(recent!.saved).toBe(true);

    // Another scene in the same tab gets its own entry.
    e.newFile(200, 200);
    e.addShape('ellipse');
    await e.saveSession(); await settle();
    expect(await store.list()).toHaveLength(2);
  });

  it('reopens a recent scene after the tab is gone, and goes on writing the same entry', async () => {
    const store = memoryStore();
    const before = new Editor();
    before.recents = store;
    before.newFile(400, 300);
    before.addShape('star');
    before.name = 'Stars';
    await before.saveSession(); await settle();
    const [recent] = await store.list();

    // The browser closed: no tab, no sessionStorage.
    sessionStorage.clear();
    const after = new Editor();
    after.recents = store;
    expect(await after.loadFromURL()).toBe(false);
    expect(await after.openRecent(recent!)).toBe(true);
    expect(after.name).toBe('Stars');
    expect(after.scene!.objects).toHaveLength(before.scene!.objects.length);

    after.addShape('ellipse');
    await after.saveSession(); await settle();
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(recent!.id);
  });
});
