// The scene travels in the URL (#s=…), compressed with deflate and in base64url.
// Only the scene's shape (its types and how to recognise it): the engine loads separately, when needed.
import { isScene, type SceneV1 } from '@svertik/engine/scene';

const toB64url = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (text: string) => {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export interface SharedState {
  scene: SceneV1;
  name: string;
  script?: string;
  /** Editor canvas colour. */
  canvas?: string;
}

export async function encodeState(state: SharedState): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(state));
  return toB64url(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeState(text: string): Promise<SharedState | null> {
  try {
    const json = await pipe(fromB64url(text), new DecompressionStream('deflate-raw'));
    const state = JSON.parse(new TextDecoder().decode(json)) as SharedState;
    return isScene(state?.scene) ? state : null;
  } catch {
    return null;
  }
}

/** Browsers take long URLs, but not endless ones: above this, nothing is saved in the URL. */
export const MAX_HASH = 60_000;

/**
 * The short-link service (apps/link, e.g. https://link.svertik.com), set at build time with VITE_SHARE_URL.
 * Empty: Share puts the whole scene in the link.
 */
export const SHARE_SERVICE = ((import.meta.env.VITE_SHARE_URL as string | undefined) ?? '').trim().replace(/\/+$/, '');
/** What the service accepts (encoded text). */
export const MAX_SHORT = 4 * 1024 * 1024;
/** Short-link ids: base62, as the service makes them. */
export const SHORT_ID = /^[A-Za-z0-9]{10}$/;

/** Where a shared link opens: Play (shared from Play) or the editor (shared from the editor). */
export type ShareTarget = 'play' | 'edit';

/** A short link: link.example/<id> opens Play, link.example/e/<id> the editor. */
export const shortLink = (id: string, target: ShareTarget, service = SHARE_SERVICE) => `${service}/${target === 'edit' ? 'e/' : ''}${id}`;

/**
 * Stores an encoded scene in the service and returns its id, or null (no service, too big, offline,
 * refused…), so the caller can fall back to the long link.
 */
export async function shortenState(encoded: string, service = SHARE_SERVICE): Promise<string | null> {
  if (!service || encoded.length > MAX_SHORT) return null;
  try {
    // A plain-text body keeps it a simple request: no CORS preflight.
    const response = await fetch(`${service}/`, { method: 'POST', body: encoded, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const { id } = (await response.json()) as { id?: unknown };
    return typeof id === 'string' && SHORT_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Gives a stored scene its preview card (a JPEG), shown by chat apps and social sites. The first one stays.
 * False if it could not be sent; the link works anyway, only without a picture.
 */
export async function uploadPreview(id: string, jpeg: Blob, service = SHARE_SERVICE): Promise<boolean> {
  if (!service || !SHORT_ID.test(id)) return false;
  try {
    // An untyped body sends no Content-Type: a simple request, no CORS preflight. The service checks it is a JPEG.
    const response = await fetch(`${service}/${id}.jpg`, { method: 'POST', body: new Blob([jpeg]), signal: AbortSignal.timeout(10_000) });
    return response.ok;
  } catch {
    return false;
  }
}

/** The scene behind a short link's id (play.html#l=…), or null. */
export async function fetchState(id: string, service = SHARE_SERVICE): Promise<SharedState | null> {
  if (!service || !SHORT_ID.test(id)) return null;
  try {
    const response = await fetch(`${service}/${id}.txt`, { signal: AbortSignal.timeout(15_000) });
    return response.ok ? decodeState((await response.text()).trim()) : null;
  } catch {
    return null;
  }
}

/**
 * The state a location hash carries: #s= (edit) / #p= (Play) the scene itself; #e= (edit) / #l= (Play) a short
 * link's id, fetched from the link service.
 */
export type HashMode = 's' | 'p' | 'e' | 'l';
export async function stateFromHash(hash: string): Promise<{ state: SharedState; mode: HashMode } | null> {
  const m = hash.match(/^#([spel])=(.+)$/);
  if (!m) return null;
  const mode = m[1] as HashMode;
  const state = mode === 'l' || mode === 'e' ? await fetchState(m[2]!) : await decodeState(m[2]!);
  return state ? { state, mode } : null;
}
