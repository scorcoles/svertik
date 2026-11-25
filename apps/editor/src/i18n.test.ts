// Translations: the language a browser gets, `t()` itself, and that every interface text has its Spanish.
import { afterEach, describe, expect, it } from 'vitest';
import { effectDescriptions, shapeDescriptions } from '@svertik/engine';
import { setTranslations, t } from '@svertik/ui/i18n';
import { detectLocale } from './i18n';
import { ES } from './i18n/es';
import { ES_EFFECTS } from './i18n/es-effects';
import demos from './demo-metadata.json';

// The sources as text (Vite reads them): the editor's and the UI package's components and modules.
const SOURCES: Record<string, string> = {
  ...import.meta.glob(['./**/*.{svelte,ts}', '!./**/*.test.ts', '!./i18n/**'], { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob(['../../../packages/ui/src/lib/**/*.{svelte,ts}', '!../../../packages/ui/src/lib/**/*.test.ts'], { query: '?raw', import: 'default', eager: true }),
};

/** Every literal `t('…')` in the editor and the UI package (tests and the tables themselves aside), with its file. */
function sourceKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const [path, text] of Object.entries(SOURCES)) {
    for (const m of text.matchAll(/(?<![\w.])t\(\s*'((?:[^'\\]|\\.)*)'/g)) keys.set(m[1]!.replace(/\\(.)/g, '$1'), path.split('/').pop()!);
  }
  return keys;
}
const placeholders = (text: string) => [...text.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort();

afterEach(() => setTranslations({}));

describe('language', () => {
  it('follows the browser unless the person chose one', () => {
    expect(detectLocale('', ['es-ES', 'en'])).toBe('es');
    expect(detectLocale('', ['es-MX'])).toBe('es');
    expect(detectLocale('', ['fr-FR', 'es'])).toBe('es');
    expect(detectLocale('', ['en-GB', 'es'])).toBe('en');
    expect(detectLocale('', ['fr', 'de'])).toBe('en');
    expect(detectLocale('', [])).toBe('en');
    expect(detectLocale('en', ['es-ES'])).toBe('en');
    expect(detectLocale('es', ['en-US'])).toBe('es');
  });

  it('translates, fills placeholders and falls back to English', () => {
    expect(t('Saved {name}', { name: 'logo.json' })).toBe('Saved logo.json');
    setTranslations(ES);
    expect(t('Saved {name}', { name: 'logo.json' })).toBe('Guardado logo.json');
    expect(t('A text nobody translated')).toBe('A text nobody translated');
    expect(t('{count} warnings', { count: 3 })).toBe('3 avisos');
  });
});

describe('Spanish', () => {
  it('has every interface text, with the same placeholders', () => {
    const missing: string[] = [], mismatched: string[] = [];
    const keys = sourceKeys();
    // The sources were found (an empty glob would pass for nothing).
    expect(keys.size).toBeGreaterThan(800);
    for (const [key, file] of keys) {
      const es = ES[key];
      if (es === undefined) missing.push(`${file}: ${key}`);
      else if (placeholders(es).join() !== placeholders(key).join()) mismatched.push(`${key} → ${es}`);
    }
    expect(missing).toEqual([]);
    expect(mismatched).toEqual([]);
  });

  it('has the help of every effect and shape, and every demo description', () => {
    const help = { ...effectDescriptions, ...shapeDescriptions };
    expect(Object.entries(help).filter(([, text]) => !ES_EFFECTS[text]).map(([type]) => type)).toEqual([]);
    expect(demos.filter((demo) => !ES[demo.description]).map((demo) => demo.which)).toEqual([]);
  });
});
