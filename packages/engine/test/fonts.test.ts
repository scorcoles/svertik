/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildShape, fontKey, fontsourceURL, hasFont, legacyStyle, loadFont } from '../src';

const woff = readFileSync(resolve(__dirname, '../../ui/node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff'));

const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
});

describe('los nombres antiguos de las fuentes', () => {
  it('el estilo que tenía el nombre se separa en familia y peso', () => {
    expect(legacyStyle('JetBrains Mono Bold')).toEqual({ family: 'JetBrains Mono', weight: 700, italic: false });
    expect(legacyStyle('Inter Light')).toEqual({ family: 'Inter', weight: 300, italic: false });
    expect(legacyStyle('Inter Italic')).toEqual({ family: 'Inter', weight: 400, italic: true });
  });

  it('un nombre que no es un estilo se queda como estaba', () => {
    expect(legacyStyle('JetBrains Mono')).toBeNull();
    expect(legacyStyle('Playfair Display')).toBeNull();
  });

  it('si la familia no existe, se baja la del nombre sin el estilo y se registra con el nombre pedido', async () => {
    const asked: string[] = [];
    globalThis.fetch = (async (url: string) => {
      asked.push(url);
      // La familia del nombre antiguo no existe en Fontsource; la de verdad, sí.
      if (url.includes('jetbrains-mono-bold')) return new Response('', { status: 404 });
      return new Response(woff, { status: 200 });
    }) as typeof fetch;

    const ok = await loadFont('JetBrains Mono Bold');
    expect(ok).toBe(true);
    expect(asked).toEqual([fontsourceURL('JetBrains Mono Bold', 400), fontsourceURL('JetBrains Mono', 700)]);
    // Registrada con el nombre que pide la escena: el texto la encuentra.
    expect(hasFont('JetBrains Mono Bold')).toBe(true);
    expect(buildShape('text', { text: 'AB', font: 'JetBrains Mono Bold', size: 100 }).shapes).toHaveLength(2);
  });

  it('una familia de verdad se baja tal cual, sin tocar su nombre', async () => {
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
