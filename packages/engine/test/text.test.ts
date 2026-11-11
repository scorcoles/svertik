/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bounds, buildShape, builtins, createEngine, fontFor, registerFont, type SceneV2 } from '../src';

const woff = readFileSync(resolve(__dirname, '../../ui/node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff'));
registerFont('JetBrains Mono', woff.buffer.slice(woff.byteOffset, woff.byteOffset + woff.byteLength));

describe('text', () => {
  it('one piece per letter (without the spaces), centred on the origin', () => {
    const geo = buildShape('text', { text: 'ab c', size: 100 });
    expect(geo.shapes.map((s) => s.clone)).toEqual([0, 1, 2]);
    const b = bounds(geo);
    expect(b.x + b.width / 2).toBeCloseTo(0);
    expect(b.y + b.height / 2).toBeCloseTo(0);
  });

  it('two lines: taller; tracking spaces the letters', () => {
    const one = bounds(buildShape('text', { text: 'ab', size: 100 }));
    expect(bounds(buildShape('text', { text: 'ab\nab', size: 100 })).height).toBeGreaterThan(one.height * 1.5);
    expect(bounds(buildShape('text', { text: 'ab', size: 100, tracking: 500 })).width).toBeGreaterThan(one.width + 40);
  });

  it('letter outlines are closed (even if the font leaves out the Z): clipping works', () => {
    const geo = buildShape('text', { text: 'BO', size: 100 });
    expect(geo.shapes.every((s) => s.subpaths.every((sp) => sp.closed))).toBe(true);
  });

  it('a missing font: the first registered one is used, and it is reported', () => {
    expect(fontFor('Nope')?.fallback).toBe(true);
    expect(buildShape('text', { text: 'a', font: 'Nope' }).shapes).toHaveLength(1);
  });
});

describe('Range and Field', () => {
  it('each letter carries its word and its line', () => {
    const geo = buildShape('text', { text: 'ab c\nde', size: 50 });
    expect(geo.shapes.map((s) => [s.word, s.line])).toEqual([[0, 0], [0, 0], [1, 0], [2, 1], [2, 1]]);
  });
});

describe('fonts with weight and italic', () => {
  it('registered name and Fontsource address', async () => {
    const { fontKey, fontsourceURL } = await import('../src');
    expect(fontKey('Inter')).toBe('Inter');
    expect(fontKey('Inter', 700, true)).toBe('Inter 700 italic');
    expect(fontsourceURL('Playfair Display', 900, true)).toBe('https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-900-italic.woff');
  });
});

describe('text anchor', () => {
  // Where the ink of a text placed at x = 0 ends up, by its anchor.
  const placed = (text: string, anchor: string) => {
    const scene: SceneV2 = { version: 2, objects: [{ kind: 'shape', id: 't', name: 't', shape: 'text', params: { text, size: 100, anchor }, stack: [] }] };
    return createEngine(builtins).evaluateDocument(scene).nodes.get('t')!.box;
  };
  it('ink (default): the centre of the ink, at the position', () => {
    const b = placed('ab', 'ink');
    expect(b.x + b.width / 2).toBeCloseTo(0);
    expect(b.y + b.height / 2).toBeCloseTo(0);
  });
  it('left: the left edge does not move when the text changes', () => {
    const a = placed('1', 'left'), b = placed('1234567', 'left');
    expect(Math.abs(a.x - b.x)).toBeLessThan(15);
    expect(b.x).toBeGreaterThanOrEqual(-1);
    expect(b.x + b.width).toBeGreaterThan(300);
  });
  it('right: grows to the left', () => {
    const b = placed('1234567', 'right');
    expect(b.x + b.width).toBeLessThanOrEqual(1);
    expect(b.x).toBeLessThan(-300);
  });
  it('center: the same baseline even if the letters change (the ink of a and A neither rises nor drops)', () => {
    const a = placed('a', 'center'), b = placed('A', 'center');
    // The bottom (the baseline) in the same place, except the overshoot of the curve of the a.
    expect(Math.abs(a.y + a.height - (b.y + b.height))).toBeLessThan(2);
    // With ink, on the other hand, each one centres by its ink and the baseline jumps.
    const ia = placed('a', 'ink'), ib = placed('A', 'ink');
    expect(Math.abs(ia.y + ia.height - (ib.y + ib.height))).toBeGreaterThan(5);
  });
});
