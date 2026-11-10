/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bounds, buildShape, builtins, createEngine, fontFor, registerFont, type SceneV2 } from '../src';

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

  it('los contornos de las letras son cerrados (aunque la fuente no ponga la Z): los recortes funcionan', () => {
    const geo = buildShape('text', { text: 'BO', size: 100 });
    expect(geo.shapes.every((s) => s.subpaths.every((sp) => sp.closed))).toBe(true);
  });

  it('una fuente que no está: se usa la primera registrada, y se sabe', () => {
    expect(fontFor('Nope')?.fallback).toBe(true);
    expect(buildShape('text', { text: 'a', font: 'Nope' }).shapes).toHaveLength(1);
  });
});

describe('Range y Field', () => {
  it('cada letra lleva su palabra y su línea', () => {
    const geo = buildShape('text', { text: 'ab c\nde', size: 50 });
    expect(geo.shapes.map((s) => [s.word, s.line])).toEqual([[0, 0], [0, 0], [1, 0], [2, 1], [2, 1]]);
  });
});

describe('fuentes con peso y cursiva', () => {
  it('nombre con que se registra y dirección en Fontsource', async () => {
    const { fontKey, fontsourceURL } = await import('../src');
    expect(fontKey('Inter')).toBe('Inter');
    expect(fontKey('Inter', 700, true)).toBe('Inter 700 italic');
    expect(fontsourceURL('Playfair Display', 900, true)).toBe('https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-900-italic.woff');
  });
});

describe('ancla del texto', () => {
  // Dónde queda la tinta de un texto colocado en x = 0, según su ancla.
  const placed = (text: string, anchor: string) => {
    const scene: SceneV2 = { version: 2, objects: [{ kind: 'shape', id: 't', name: 't', shape: 'text', params: { text, size: 100, anchor }, stack: [] }] };
    return createEngine(builtins).evaluateDocument(scene).nodes.get('t')!.box;
  };
  it('ink (por defecto): el centro de la tinta, en la posición', () => {
    const b = placed('ab', 'ink');
    expect(b.x + b.width / 2).toBeCloseTo(0);
    expect(b.y + b.height / 2).toBeCloseTo(0);
  });
  it('left: el borde izquierdo no se mueve al cambiar el texto', () => {
    const a = placed('1', 'left'), b = placed('1234567', 'left');
    expect(Math.abs(a.x - b.x)).toBeLessThan(15);
    expect(b.x).toBeGreaterThanOrEqual(-1);
    expect(b.x + b.width).toBeGreaterThan(300);
  });
  it('right: crece hacia la izquierda', () => {
    const b = placed('1234567', 'right');
    expect(b.x + b.width).toBeLessThanOrEqual(1);
    expect(b.x).toBeLessThan(-300);
  });
  it('center: la misma línea base aunque cambien las letras (la tinta de «a» y la de «A» no suben ni bajan)', () => {
    const a = placed('a', 'center'), b = placed('A', 'center');
    // La parte de abajo (la línea base) en el mismo sitio, salvo el sobrante de la curva de la «a».
    expect(Math.abs(a.y + a.height - (b.y + b.height))).toBeLessThan(2);
    // Con ink, en cambio, cada una se centra por su tinta y la base salta.
    const ia = placed('a', 'ink'), ib = placed('A', 'ink');
    expect(Math.abs(ia.y + ia.height - (ib.y + ib.height))).toBeGreaterThan(5);
  });
});
