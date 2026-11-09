// La escena viaja en la URL (#s=…), comprimida con deflate y en base64url.
import type { Scene } from '@svertik/engine';

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
  scene: Scene;
  name: string;
  script?: string;
}

export async function encodeState(state: SharedState): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(state));
  return toB64url(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeState(text: string): Promise<SharedState | null> {
  try {
    const json = await pipe(fromB64url(text), new DecompressionStream('deflate-raw'));
    const state = JSON.parse(new TextDecoder().decode(json)) as SharedState;
    return state?.scene?.version === 1 && typeof state.scene.source === 'string' ? state : null;
  } catch {
    return null;
  }
}

/** Los navegadores aguantan URLs largas, pero no infinitas: por encima de esto no se guarda en la URL. */
export const MAX_HASH = 60_000;
