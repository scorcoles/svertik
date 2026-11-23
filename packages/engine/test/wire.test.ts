import { describe, expect, it } from 'vitest';
import { builtins, createEngine, highlightWireRange, installWire, renderInto, wireBodyKinds, wireColors, wireSelectionPalette, type SceneV1 } from '../src';

const scene: SceneV1 = {
  version: 1,
  objects: [{ kind: 'shape', id: 'a', name: 'A', shape: 'star', params: {}, stack: [] }],
};

describe('wire', () => {
  it('highlights only the active Range, and preserves overlapping selector provenance', () => {
    const scene: SceneV1 = { version: 1, objects: [{ kind: 'shape', id: 'box', name: 'Box', shape: 'rectangle', params: { width: 10, height: 10 }, stack: [
      { id: 'clone', type: 'clone', params: { columns: 3, rows: 3 } },
      { id: 'columns', type: 'range', params: { unit: 'columns', selector: 'odd' } },
      { id: 'rows', type: 'range', params: { unit: 'rows', selector: 'even' } },
    ] }] };
    const geo = createEngine(builtins).evaluateDocument(scene).geometry;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    renderInto(svg, geo);
    expect(new Set(wireSelectionPalette).size).toBeGreaterThanOrEqual(5);
    highlightWireRange(svg, 'columns', 0);
    expect(svg.querySelectorAll('[data-wire-selected]')).toHaveLength(6);
    const color = svg.style.getPropertyValue('--wire-selection-color');
    highlightWireRange(svg, 'rows', 1);
    expect(svg.querySelectorAll('[data-wire-selected]')).toHaveLength(3);
    expect(svg.style.getPropertyValue('--wire-selection-color')).not.toBe(color);
    highlightWireRange(svg, null);
    expect(svg.querySelectorAll('[data-wire-selected]')).toHaveLength(0);
  });

  it('keeps the original filled hit areas and stroke widths while Wire changes only paint', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.append(svg);
    const engine = createEngine(builtins), geo = engine.evaluateDocument(scene).geometry;
    renderInto(svg, geo);
    const wire = installWire(svg, scene, { initial: true });
    const original = svg.querySelector('[data-svertik-shape]')!;
    const hit = svg.querySelector('[data-wire-hits] path')!;
    expect(hit.getAttribute('fill')).toBe(original.getAttribute('fill'));
    expect(hit.getAttribute('d')).toBe(original.getAttribute('d'));
    expect(hit.hasAttribute('data-svertik-shape')).toBe(false);
    renderInto(svg, geo);
    wire.refresh();
    expect(svg.querySelectorAll('[data-svertik-shape]')).toHaveLength(1);
    expect(svg.querySelectorAll('[data-wire-hits] path')).toHaveLength(1);
    expect(svg.querySelector('[data-wire-hits]')?.getAttribute('opacity')).toBe('0');
    wire.dispose(); svg.remove();
  });

  it('classifies materials only when a simulation consumes them', () => {
    const s: SceneV1 = { version: 1, objects: [{ kind: 'shape', id: 'soft', name: 'Soft', shape: 'rectangle', params: {}, stack: [{ id: 'material', type: 'softbody', params: {} }] }] };
    expect(wireBodyKinds(s).has('soft')).toBe(false);
    s.objects[0]!.stack.push({ id: 'fall', type: 'gravity', params: {} });
    expect(wireBodyKinds(s).get('soft')).toBe('mobile');
  });
  it('gives every node a colour', () => {
    expect(wireColors(scene).get('a')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('toggles with the W key, ignores typing and modifiers, and undoes itself', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const seen: boolean[] = [];
    const wire = installWire(svg, scene, { onChange: (on) => seen.push(on) });
    dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(svg.classList.contains('wire')).toBe(true);
    dispatchEvent(new KeyboardEvent('keydown', { key: 'w', metaKey: true }));
    expect(svg.classList.contains('wire')).toBe(true);
    dispatchEvent(new KeyboardEvent('keydown', { key: 'W' }));
    expect(svg.classList.contains('wire')).toBe(false);
    expect(seen).toEqual([true, false]);
    wire.dispose();
    dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(svg.classList.contains('wire')).toBe(false);
    expect(document.head.querySelector('style')).toBeNull();
  });
});
