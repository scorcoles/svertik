/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bounds, buildShape, fontFor, registerFont } from '../src';

const woff = readFileSync(resolve(__dirname, '../../ui/node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff'));
registerFont('JetBrains Mono', woff.buffer.slice(woff.byteOffset, woff.byteOffset + woff.byteLength));

describe('texto', () => {
  it('una pieza por letra (sin los espacios), centrada en el origen', () => {
    const geo = buildShape('text', { text: 'ab c', size: 100 });
    expect(geo.shapes.map((s) => s.clone)).toEqual([0, 1, 2]);
    const b = bounds(geo);
    expect(b.x + b.width / 2).toBeCloseTo(0);
    expect(b.y + b.height / 2).toBeCloseTo(0);
  });

  it('dos líneas: más alto; el tracking separa las letras', () => {
    const one = bounds(buildShape('text', { text: 'ab', size: 100 }));
    expect(bounds(buildShape('text', { text: 'ab\nab', size: 100 })).height).toBeGreaterThan(one.height * 1.5);
    expect(bounds(buildShape('text', { text: 'ab', size: 100, tracking: 500 })).width).toBeGreaterThan(one.width + 40);
  });

  it('una fuente que no está: se usa la primera registrada, y se sabe', () => {
    expect(fontFor('Nope')?.fallback).toBe(true);
    expect(buildShape('text', { text: 'a', font: 'Nope' }).shapes).toHaveLength(1);
  });
});
