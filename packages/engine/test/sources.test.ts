import { describe, expect, it } from 'vitest';
import { attachSources, builtins, createEngine, detachSources, missingSources, resolveSources, validateScene, type SceneV1 } from '../src';

const star = '<svg viewBox="0 0 10 10"><path d="M0 0H10V10Z"/></svg>';
const dot = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';
const scene = (): SceneV1 => ({
  version: 1,
  objects: [
    { kind: 'object', id: 'a', name: 'Star.svg', source: star, stack: [] },
    { kind: 'object', id: 'b', name: 'Star.svg', source: dot, stack: [] },
    { kind: 'object', id: 'c', name: 'Copy', source: star, stack: [] },
    { kind: 'group', id: 'comp', name: 'Comp', children: [], stack: [], composition: { scene: { version: 1, objects: [{ kind: 'object', id: 'a', name: 'Inner', source: dot, stack: [] }] } } },
  ],
});

describe('external SVG sources', () => {
  it('detaches every source (also inside compositions): same SVG, same file; different SVGs, different files', () => {
    const { scene: out, files } = detachSources(scene());
    const [a, b, c] = out.objects as { href?: string; source: string }[];
    expect([a!.href, b!.href, c!.href]).toEqual(['Star.svg', 'Star-2.svg', 'Star.svg']);
    expect(out.objects.every((n) => n.kind !== 'object' || n.source === '')).toBe(true);
    expect(files.get('Star.svg')).toBe(star);
    expect(files.get('Star-2.svg')).toBe(dot);
    expect(missingSources(out)).toEqual(['Star.svg', 'Star-2.svg']);
    expect(JSON.stringify(out)).not.toContain('<svg');
  });
  it('a detached scene validates with a warning and draws without the missing objects', () => {
    const { scene: out } = detachSources(scene());
    const report = validateScene(out, builtins);
    expect(report.errors).toEqual([]);
    expect(report.warnings.some((w) => w.includes('Star.svg'))).toBe(true);
    expect(() => createEngine(builtins).toSVG(out)).not.toThrow();
  });
  it('attaches them back by href or by bare file name, and the result draws like the original', async () => {
    const { scene: out, files } = detachSources(scene());
    const back = attachSources(out, { 'art/Star.svg': star, 'Star-2.svg': dot, 'Inner.svg': dot });
    expect(missingSources(back)).toEqual([]);
    const engine = createEngine(builtins);
    expect(engine.toSVG(back)).toBe(engine.toSVG(scene()));
    const read = await resolveSources(out, (href) => files.get(href)!);
    expect(engine.toSVG(read)).toBe(engine.toSVG(scene()));
  });
});
