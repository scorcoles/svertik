import { describe, expect, it } from 'vitest';
import type { Scene } from '@svertik/engine';
import { DEFAULT_SCRIPT, exportJS, extractScript, jsDocument, jsLiteral, sourceRange, syntaxErrorLine } from './code';

const scene: Scene = {
  version: 1,
  source: '<svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg>',
  stack: [{ id: 'w', type: 'wave', enabled: true, params: { phase: 0 } }],
};

describe('JS del panel', () => {
  it('claves sin comillas y cadenas con comilla simple', () => {
    expect(jsLiteral({ a: 'x', 'b-c': 1 })).toBe("{\n  a: 'x',\n  'b-c': 1\n}");
  });

  it('el documento lleva import, source como constante, la escena y el script', () => {
    const doc = jsDocument(scene, DEFAULT_SCRIPT);
    expect(doc).toMatch(/^import \{ createEngine, wave \} from '@svertik\/engine';/);
    expect(doc).toContain('const source = `<svg');
    expect(doc).toContain("const scene = {\n  version: 1,\n  source,\n  stack: [\n    { id: 'w', type: 'wave', enabled: true, params: { phase: 0 } },\n  ],\n};");
    expect(doc.endsWith(DEFAULT_SCRIPT)).toBe(true);
  });

  it('separa el script del usuario aunque cambie la escena', () => {
    const mine = 'onFrame((t) => { scene.stack[0].params.phase = t; });\n';
    const doc = jsDocument(scene, mine);
    expect(extractScript(doc)).toBe(mine);
  });

  it('encuentra el literal del SVG para plegarlo', () => {
    const doc = jsDocument(scene, '');
    const [a, b] = sourceRange(doc)!;
    expect(doc.slice(a, b)).toBe(scene.source);
  });

  it('el JS exportado define el motor y onFrame', () => {
    const js = exportJS(scene, DEFAULT_SCRIPT);
    expect(js).toContain('const engine = createEngine([wave]);');
    expect(js).toContain('function onFrame(fn)');
    // Es JS válido (sin el import, que necesita un módulo).
    expect(() => new Function(js.replace(/^import[^;]*;/m, ''))).not.toThrow();
  });

  it('el JS del panel, ejecutado, devuelve la misma escena', () => {
    const body = jsDocument(scene, DEFAULT_SCRIPT).replace(/^import[^;]*;/m, '');
    const run = new Function('onFrame', body + '\n;return scene;');
    expect(run(() => {})).toEqual(scene);
  });

  it('localiza la línea de un error de sintaxis', () => {
    expect(syntaxErrorLine('const a = 1;\nconst b = 2;\nfoo(;\n')).toBe(3);
    expect(syntaxErrorLine('const a = 1;\n')).toBeNull();
  });
});
