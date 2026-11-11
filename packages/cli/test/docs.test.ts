// La documentación generada no puede mentir: el JSON de ejemplo de cada página (y el de AGENTS.md) se
// mete en una escena, se valida sin errores ni avisos y se dibuja.
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { builtins, createEngine, validateScene, type SceneV2 } from '@svertik/engine';
import { generateDocs } from '../src/docs';
import { registerBundledFonts } from '../src/lib';

await registerBundledFonts();
const out = mkdtempSync(join(tmpdir(), 'svertik-docs-'));
const pages = generateDocs(out);
const jsonOf = (md: string) => JSON.parse(/```json\n([\s\S]*?)\n```/.exec(md)![1]!);

describe('docs', () => {
  it('una página por efecto y primitiva, más el índice', () => {
    expect(pages).toBe(1 + readdirSync(join(out, 'reference/effects')).length + readdirSync(join(out, 'reference/shapes')).length);
  });

  it('el ejemplo de cada efecto, en una escena: válido y se dibuja', () => {
    const engine = createEngine(builtins);
    for (const f of readdirSync(join(out, 'reference/effects'))) {
      const mod = jsonOf(readFileSync(join(out, 'reference/effects', f), 'utf8'));
      const scene = { version: 2, objects: [{ kind: 'shape', id: 'base', name: 'Base', shape: 'star', params: {}, stack: [mod] }] } as SceneV2;
      expect(validateScene(scene), f).toEqual({ errors: [], warnings: [] });
      expect(() => engine.toSVG(scene), f).not.toThrow();
    }
  });

  it('el ejemplo de cada primitiva, también', () => {
    const engine = createEngine(builtins);
    for (const f of readdirSync(join(out, 'reference/shapes'))) {
      const node = jsonOf(readFileSync(join(out, 'reference/shapes', f), 'utf8'));
      const scene = { version: 2, objects: [node] } as SceneV2;
      expect(validateScene(scene), f).toEqual({ errors: [], warnings: [] });
      expect(engine.toSVG(scene), f).toMatch(/<path/);
    }
  });

  it('el ejemplo de AGENTS.md es válido', () => {
    const md = readFileSync(join(import.meta.dirname, '../../engine/AGENTS.md'), 'utf8');
    const src = /const scene: SceneV2 = (\{[\s\S]*?\n\});/.exec(md)![1]!;
    const scene = new Function(`return ${src}`)() as SceneV2;
    expect(validateScene(scene)).toEqual({ errors: [], warnings: [] });
    expect(createEngine(builtins).toSVG(scene)).toMatch(/<path/);
  });

  it('la referencia del repo está al día (si falla: pnpm docs)', () => {
    const repo = join(import.meta.dirname, '../../engine/docs/reference');
    const list = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? list(join(d, e.name)).map((x) => `${e.name}/${x}`) : [e.name])).sort();
    const fresh = join(out, 'reference');
    expect(list(repo)).toEqual(list(fresh));
    for (const f of list(fresh)) expect(readFileSync(join(repo, f), 'utf8'), f).toBe(readFileSync(join(fresh, f), 'utf8'));
  });
});
