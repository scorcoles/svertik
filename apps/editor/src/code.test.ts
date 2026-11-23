import { describe, expect, it } from 'vitest';
import type { SceneV1 } from '@svertik/engine';
import { DEFAULT_SCRIPT, exportJS, extractScript, jsDocument, jsLiteral, sourceRanges, syntaxErrorLine } from './code';

const svg = '<svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg>';
const scene: SceneV1 = {
  version: 1,
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

describe('panel JS', () => {
  it('unquoted keys and single-quoted strings', () => {
    expect(jsLiteral({ a: 'x', 'b-c': 1 })).toBe("{\n  a: 'x',\n  'b-c': 1\n}");
  });

  it('one constant per SVG, named after the file', () => {
    const doc = jsDocument(scene, DEFAULT_SCRIPT);
    expect(doc).toMatch(/^import \{ createEngine, wave \} from '@svertik\/engine';/);
    expect(doc).toContain('const starLogo = `<svg');
    expect(doc).toContain('const svg2x = `<svg');
    expect(doc).toContain('source: starLogo,');
    expect(doc).toContain("{ id: 'w', type: 'wave', enabled: true, params: { phase: 0 } },");
    expect(doc.endsWith(DEFAULT_SCRIPT)).toBe(true);
  });

  it('separates the user\'s script even when the scene changes', () => {
    const mine = 'onFrame((t) => { scene.objects[0].stack[0].params.phase = t; });\n';
    expect(extractScript(jsDocument(scene, mine))).toBe(mine);
  });

  it('finds each SVG to fold it', () => {
    const doc = jsDocument(scene, '');
    const ranges = sourceRanges(doc);
    expect(ranges).toHaveLength(2);
    for (const [a, b] of ranges) expect(doc.slice(a, b)).toBe(svg);
  });

  it('the exported JS defines the engine and onFrame, and is valid JS', () => {
    const js = exportJS(scene, DEFAULT_SCRIPT);
    expect(js).toContain('const engine = createEngine([wave]);');
    expect(js).toContain('function onFrame(fn)');
    expect(() => new Function(js.replace(/^import[^;]*;/m, ''))).not.toThrow();
  });

  it('the panel JS, when run, returns the same scene', () => {
    const body = jsDocument(scene, DEFAULT_SCRIPT).replace(/^import[^;]*;/m, '');
    const run = new Function('onFrame', body + '\n;return scene;');
    expect(run(() => {})).toEqual(scene);
  });

  it('finds the line of a syntax error', () => {
    expect(syntaxErrorLine('const a = 1;\nconst b = 2;\nfoo(;\n')).toBe(3);
    expect(syntaxErrorLine('const a = 1;\n')).toBeNull();
  });
});

describe('code with animation', () => {
  it('uses the engine player (timeline, interactions and reduced motion)', () => {
    const js = exportJS({ version: 1, objects: [], animation: { duration: 2, tracks: [{ id: 't', node: 'a', on: 'node', param: 'x', keys: [{ t: 0, value: 0 }] }] } }, '');
    expect(js).toContain('createPlayer');
    expect(js).toContain('createPlayer(engine, document.querySelector');
    expect(js).toContain('reduce motion');
  });
});

it('exports Mouse Instance scenes with the interactive player', () => {
  const s: SceneV1 = { version: 1, objects: [{ kind: 'instance', id: 'mouse', name: 'Mouse', of: 'source', stack: [], mouse: { event: 'move' } }] };
  const js = exportJS(s, '');
  expect(js).toContain('createPlayer(engine, document.querySelector');
  expect(js).toContain("mouse: { event: 'move' }");
  expect(js.split('\n')[0]).toContain('createPlayer');
});

it('exports static Full viewport scenes with the responsive player', () => {
  const s: SceneV1 = { version: 1, fullViewport: true, objects: [] };
  expect(exportJS(s, '')).toContain('createPlayer(engine, document.querySelector');
});

it('exports trackless Infinite scenes using the player', () => {
  expect(exportJS({ version: 1, objects: [], animation: { duration: 10, infinite: true, loop: false, tracks: [] } }, '')).toContain('createPlayer(engine, document.querySelector');
});
