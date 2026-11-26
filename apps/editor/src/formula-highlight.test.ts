import { describe, expect, it } from 'vitest';
import { highlightFormula, tokenizeFormula } from './formula-highlight';

const kinds = (source: string) => tokenizeFormula(source).filter((t) => t.kind !== 'space').map((t) => `${t.text}:${t.kind}${t.depth !== undefined ? t.depth : ''}`);

describe('formula colouring', () => {
  it('tells functions, variable chains, numbers, operators and nested brackets apart', () => {
    expect(kinds('clamp(scene.mouse.posX * 2, 0, pi)')).toEqual([
      'clamp:function', '(:bracket0', 'scene:variable', '.:variable', 'mouse:variable', '.:variable', 'posX:variable',
      '*:operator', '2:number', ',:operator', '0:number', ',:operator', 'pi:number', '):bracket0',
    ]);
    expect(kinds('max(1, min(2, 3))').filter((k) => k.includes('bracket'))).toEqual(['(:bracket0', '(:bracket1', '):bracket1', '):bracket0']);
  });
  it('reads element., this., props., children["id"].property and scene.countDown()', () => {
    expect(kinds('this.radius - element.index')).toEqual(['this:variable', '.:variable', 'radius:variable', '-:operator', 'element:variable', '.:variable', 'index:variable']);
    expect(kinds('children["a-1"].rotation')).toEqual(['children:variable', '[:bracket0', '"a-1":string', ']:bracket0', '.:variable', 'rotation:variable']);
    expect(kinds('scene.countDown(10)').slice(0, 3)).toEqual(['scene:variable', '.:variable', 'countDown:function']);
  });
  it('marks names the language does not know', () => {
    expect(kinds('foo + sinn(1)')).toEqual(['foo:unknown', '+:operator', 'sinn:unknown', '(:bracket0', '1:number', '):bracket0']);
  });
  it('gives back the exact text, line breaks and all, escaped', () => {
    const source = 'clamp(\n  scene.time < 2,\n  0, 1)\n';
    expect(tokenizeFormula(source).map((t) => t.text).join('')).toBe(source);
    const html = highlightFormula(source);
    expect(html).toContain('&lt;');
    expect(html.endsWith(' ')).toBe(true);
    expect(html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<')).toBe(source + ' ');
  });
});
