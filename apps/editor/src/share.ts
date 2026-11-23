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
