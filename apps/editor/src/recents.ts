// Recent scenes: the work of every tab, kept in the browser (IndexedDB) so it survives closing it. A tab's
// own autosave lives in sessionStorage and comes back only when the browser restores that tab; this list
// is what the start screen offers when it doesn't. One entry per scene a tab worked on (its id stays in the
// tab's sessionStorage, so a restored tab goes on writing the same entry); only scenes with changes count.
import { t } from '@svertik/ui/i18n';

export interface Recent {
  id: string;
  name: string;
  /** When it was last written (ms since the epoch). */
  updated: number;
  /** The scene, encoded as the autosave (see share.ts encodeState). */
  state: string;
  /** Whether it was saved to a file since its last change. */
  saved: boolean;
}

export interface RecentStore {
  list(): Promise<Recent[]>;
  put(recent: Recent): Promise<void>;
  remove(id: string): Promise<void>;
}

export const MAX_RECENTS = 12;

/** Newest first, at most MAX_RECENTS (older ones are forgotten when a new one is written). */
export async function remember(store: RecentStore, recent: Recent): Promise<void> {
  await store.put(recent);
  const all = await store.list();
  for (const old of all.slice(MAX_RECENTS)) await store.remove(old.id);
}

/** How long ago, in words: "just now", "5 min ago", "3 h ago", "2 days ago", or the date. */
export function ago(then: number, now = Date.now()): string {
  const minutes = Math.floor(Math.max(0, now - then) / 60_000);
  if (minutes < 1) return t('just now');
  if (minutes < 60) return t('{count} min ago', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('{count} h ago', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? t('yesterday') : t('{count} days ago', { count: days });
  return new Date(then).toLocaleDateString(document.documentElement.lang || undefined, { day: 'numeric', month: 'short' });
}

/** In memory: for tests, and when the browser has no IndexedDB (the list then lasts this page only). */
export function memoryStore(): RecentStore {
  const items = new Map<string, Recent>();
  return {
    list: async () => [...items.values()].sort((a, b) => b.updated - a.updated),
    put: async (recent) => void items.set(recent.id, { ...recent }),
    remove: async (id) => void items.delete(id),
  };
}

const DB = 'svertik', STORE = 'recents';

/** The browser's IndexedDB; if it can't be opened (private mode in some browsers, blocked storage), memory. */
export function browserStore(): RecentStore {
  if (typeof indexedDB === 'undefined') return memoryStore();
  let opened: Promise<IDBDatabase> | null = null;
  const db = () => (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE, { keyPath: 'id' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
  const run = <T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) => db().then((d) => new Promise<T>((resolve, reject) => {
    const request = work(d.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
  const fallback = memoryStore();
  let failed = false;
  const guard = <T>(real: () => Promise<T>, instead: () => Promise<T>) => (failed ? instead() : real().catch(() => { failed = true; return instead(); }));
  return {
    list: () => guard(async () => ((await run('readonly', (s) => s.getAll())) as Recent[]).sort((a, b) => b.updated - a.updated), fallback.list),
    put: (recent) => guard(async () => void (await run('readwrite', (s) => s.put(recent))), () => fallback.put(recent)),
    remove: (id) => guard(async () => void (await run('readwrite', (s) => s.delete(id))), () => fallback.remove(id)),
  };
}
