import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SceneV1 } from '@svertik/engine/scene';
import { encodeState, fetchState, shortenState, stateFromHash } from './share';

const SERVICE = 'https://link.example';
const scene: SceneV1 = { version: 1, objects: [] };

afterEach(() => vi.unstubAllGlobals());

describe('short links', () => {
  it('posts the encoded scene as plain text and returns the short link', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: 'B1FORN1FA4', url: `${SERVICE}/B1FORN1FA4` }), { status: 201 }));
    vi.stubGlobal('fetch', fetch);
    const encoded = await encodeState({ scene, name: 'Logo' });
    expect(await shortenState(encoded, SERVICE)).toBe(`${SERVICE}/B1FORN1FA4`);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${SERVICE}/`);
    expect(init.method).toBe('POST');
    // A string body: a simple request, no CORS preflight.
    expect(init.body).toBe(encoded);
    expect(init.headers).toBeUndefined();
  });

  it('gives null without a service, when refused, offline or with an odd answer, so Share falls back', async () => {
    expect(await shortenState('abc', '')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"nope"}', { status: 429 })));
    expect(await shortenState('abc', SERVICE)).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect(await shortenState('abc', SERVICE)).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"id":"../../x"}', { status: 201 })));
    expect(await shortenState('abc', SERVICE)).toBeNull();
  });

  it('loads the scene behind a short id', async () => {
    const encoded = await encodeState({ scene, name: 'Logo', canvas: '#0d0d10' });
    const fetch = vi.fn(async () => new Response(`${encoded}\n`));
    vi.stubGlobal('fetch', fetch);
    expect(await fetchState('B1FORN1FA4', SERVICE)).toEqual({ scene, name: 'Logo', canvas: '#0d0d10' });
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe(`${SERVICE}/B1FORN1FA4.txt`);
    // Ids are checked before anything is fetched.
    expect(await fetchState('../secret', SERVICE)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reads #s=, #p= and nothing else from the hash', async () => {
    const encoded = await encodeState({ scene, name: 'Logo' });
    expect(await stateFromHash(`#s=${encoded}`)).toEqual({ state: { scene, name: 'Logo' }, mode: 's' });
    expect(await stateFromHash(`#p=${encoded}`)).toEqual({ state: { scene, name: 'Logo' }, mode: 'p' });
    expect(await stateFromHash('#x=abc')).toBeNull();
    expect(await stateFromHash('')).toBeNull();
  });
});
