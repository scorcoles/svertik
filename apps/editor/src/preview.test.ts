import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARD, fitCard, svgForCard } from './preview';
import { uploadPreview } from './share';

afterEach(() => vi.unstubAllGlobals());

describe('preview card', () => {
  it('fits the frame whole and centred in 1200 × 630', () => {
    // Wider than the card: full width, bands above and below.
    expect(fitCard(2400, 900)).toEqual({ x: 0, y: (630 - 450) / 2, width: 1200, height: 450 });
    // Taller: full height, bands at the sides.
    const tall = fitCard(800, 900);
    expect(tall.height).toBe(630);
    expect(tall.x).toBeCloseTo((1200 - 560) / 2);
    expect(CARD).toEqual({ width: 1200, height: 630 });
  });

  it('sizes the scene SVG to fill the card', async () => {
    const blob = svgForCard('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 900"><rect/></svg>');
    expect(blob.type).toBe('image/svg+xml');
    expect(await blob.text()).toBe('<svg width="980" height="630" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 900"><rect/></svg>');
  });

  it('uploads the card without a Content-Type (no CORS preflight) and reports failures', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetch);
    expect(await uploadPreview('B1FORN1FA4', new Blob(['jpeg'], { type: 'image/jpeg' }), 'https://link.example')).toBe(true);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://link.example/B1FORN1FA4.jpg');
    expect(init.method).toBe('POST');
    expect((init.body as Blob).type).toBe('');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 422 })));
    expect(await uploadPreview('B1FORN1FA4', new Blob(['x']), 'https://link.example')).toBe(false);
    expect(await uploadPreview('../x', new Blob(['x']), 'https://link.example')).toBe(false);
    expect(await uploadPreview('B1FORN1FA4', new Blob(['x']), '')).toBe(false);
  });
});
