import { describe, expect, it } from 'vitest';
import type { SceneV2 } from '@svertik/engine';
import { DEFAULT_SCRIPT, exportJS, extractScript, jsDocument, jsLiteral, sourceRanges, syntaxErrorLine } from './code';

const svg = '<svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg>';
const scene: SceneV2 = {
  version: 2,
  objects: [
    { kind: 'object', id: 'a', name: 'Star Logo.svg', source: svg, stack: [{ id: 'w', type: 'wave', enabled: true, params: { phase: 0 } }] },
    {
      kind: 'group',
      id: 'g',
      name: 'Group',
      stack: [],
      children: [{ kind: 'object', id: 'b', name: '2x.svg', source: svg, stack: [], transform: { x: 40 } }],
    },
  ],
};

describe('JS del panel', () => {
  it('claves sin comillas y cadenas con comilla simple', () => {
    expect(jsLiteral({ a: 'x', 'b-c': 1 })).toBe("{\n  a: 'x',\n  'b-c': 1\n}");
  });

  it('una constante por SVG, con nombre sacado del archivo', () => {
    const doc = jsDocument(scene, DEFAULT_SCRIPT);
    expect(doc).toMatch(/^import \{ createEngine, wave \} from '@svertik\/engine';/);
    expect(doc).toContain('const starLogo = `<svg');
    expect(doc).toContain('const svg2x = `<svg');
    expect(doc).toContain('source: starLogo,');
    expect(doc).toContain("{ id: 'w', type: 'wave', enabled: true, params: { phase: 0 } },");
    expect(doc.endsWith(DEFAULT_SCRIPT)).toBe(true);
  });

  it('separa el script del usuario aunque cambie la escena', () => {
    const mine = 'onFrame((t) => { scene.objects[0].stack[0].params.phase = t; });\n';
    expect(extractScript(jsDocument(scene, mine))).toBe(mine);
  });

  it('encuentra cada SVG para plegarlo', () => {
    const doc = jsDocument(scene, '');
    const ranges = sourceRanges(doc);
    expect(ranges).toHaveLength(2);
    for (const [a, b] of ranges) expect(doc.slice(a, b)).toBe(svg);
  });

  it('el JS exportado define el motor y onFrame, y es JS válido', () => {
    const js = exportJS(scene, DEFAULT_SCRIPT);
    expect(js).toContain('const engine = createEngine([wave]);');
    expect(js).toContain('function onFrame(fn)');
    expect(() => new Function(js.replace(/^import[^;]*;/m, ''))).not.toThrow();
  });

  it('el JS del panel, ejecutado, devuelve la misma escena', () => {
    const body = jsDocument(scene, DEFAULT_SCRIPT).replace(/^import[^;]*;/m, '');
    const run = new Function('onFrame', body + '\n;return scene;');
    expect(run(() => {})).toEqual(scene);
  });

  it('una escena v1 se escribe como v2', () => {
    const doc = jsDocument({ version: 1, source: svg, stack: [] }, '');
    expect(doc).toContain('version: 2,');
    expect(doc).toMatch(/import \{ createEngine \} from/);
  });

  it('localiza la línea de un error de sintaxis', () => {
    expect(syntaxErrorLine('const a = 1;\nconst b = 2;\nfoo(;\n')).toBe(3);
    expect(syntaxErrorLine('const a = 1;\n')).toBeNull();
  });
});

describe('código con animación', () => {
  it('importa sampleScene y reproduce la línea de tiempo', () => {
    const js = exportJS({ version: 2, objects: [], animation: { duration: 2, tracks: [{ id: 't', node: 'a', on: 'node', param: 'x', keys: [{ t: 0, value: 0 }] }] } }, '');
    expect(js).toContain('sampleScene');
    expect(js).toContain('live.update(sampleScene(scene');
    expect(js).toContain('prefers-reduced-motion');
  });
});
