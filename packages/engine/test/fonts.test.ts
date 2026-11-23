/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildShape, fontKey, fontsourceURL, hasFont, legacyStyle, loadFont } from '../src';

const woff = readFileSync(resolve(__dirname, '../../ui/node_modules/@fontsource/commit-mono/files/commit-mono-latin-700-normal.woff'));

const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
});

describe('legacy font names', () => {
  it('a style inside the name is split into family and weight', () => {
    expect(legacyStyle('Commit Mono Bold')).toEqual({ family: 'Commit Mono', weight: 700, italic: false });
    expect(legacyStyle('Inter Light')).toEqual({ family: 'Inter', weight: 300, italic: false });
    expect(legacyStyle('Inter Italic')).toEqual({ family: 'Inter', weight: 400, italic: true });
  });

  it('a name that is not a style stays as it was', () => {
    expect(legacyStyle('Commit Mono')).toBeNull();
    expect(legacyStyle('Playfair Display')).toBeNull();
  });

  it('if the family does not exist, the one without the style is downloaded and registered under the requested name', async () => {
    const asked: string[] = [];
    globalThis.fetch = (async (url: string) => {
      asked.push(url);
      // The legacy family name does not exist on Fontsource; the real one does.
      if (url.includes('commit-mono-bold')) return new Response('', { status: 404 });
      return new Response(woff, { status: 200 });
    }) as typeof fetch;

    const ok = await loadFont('Commit Mono Bold');
    expect(ok).toBe(true);
    expect(asked).toEqual([fontsourceURL('Commit Mono Bold', 400), fontsourceURL('Commit Mono', 700)]);
    // Registered under the name the scene asks for: the text finds it.
    expect(hasFont('Commit Mono Bold')).toBe(true);
    expect(buildShape('text', { text: 'AB', font: 'Commit Mono Bold', size: 100 }).shapes).toHaveLength(2);
  });

  it('a real family is downloaded as is, with its name untouched', async () => {
    const asked: string[] = [];
    globalThis.fetch = (async (url: string) => {
      asked.push(url);
      return new Response(woff, { status: 200 });
    }) as typeof fetch;

    expect(await loadFont('Inter', 700)).toBe(true);
    expect(asked).toEqual([fontsourceURL('Inter', 700)]);
    expect(hasFont(fontKey('Inter', 700))).toBe(true);
  });
});
