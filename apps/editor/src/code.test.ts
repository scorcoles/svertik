import { describe, expect, it } from 'vitest';
import type { SceneV1 } from '@svertik/engine';
import { runCode } from '@svertik/js';
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

  it('the scene in svertikJS, one constant per SVG named after the file', () => {
    const doc = jsDocument(scene, DEFAULT_SCRIPT);
    expect(doc).toMatch(/^import \{ scene, group, svg \} from '@svertik\/js';/);
    expect(doc).toContain('const starLogo = `<svg');
    expect(doc).toContain('const svg2x = `<svg');
    expect(doc).toContain("svg('Star Logo.svg', starLogo)");
    expect(doc).toContain('.wave()');
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

  it('the panel JS, when run, returns the same scene (with readable ids)', () => {
    const built = runCode(jsDocument(scene, DEFAULT_SCRIPT)).scene;
    expect(built.objects.map((o) => [o.kind, o.name])).toEqual([['object', 'Star Logo.svg'], ['group', 'Group']]);
    expect(built.objects[0]).toMatchObject({ id: 'star_logo_svg', source: svg, stack: [{ type: 'wave' }] });
    expect(built.objects[1]).toMatchObject({ children: [{ name: '2x.svg', source: svg, transform: { x: 40 } }] });
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

describe('Prettier in the JS tab', () => {
  it('formatted code still separates the script and runs to the same scene', async () => {
    const { prettyJS } = await import('./prettier');
    const mine = '// mine\n';
    const doc = await prettyJS(jsDocument(scene, mine));
    expect(extractScript(doc)).toBe(mine);
    expect(runCode(doc).scene).toEqual(runCode(jsDocument(scene, mine)).scene);
  });
});
