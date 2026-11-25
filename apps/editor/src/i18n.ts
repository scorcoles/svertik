// The editor's language: Spanish when the browser asks for it (es, es-ES, es-MX…), English otherwise, unless
// the person chose one in the svertik menu (remembered in this browser). The interface is written in English
// inside `t()` (from @svertik/ui); here the Spanish table is loaded, as its own chunk, before the interface.
import { setTranslations } from '@svertik/ui/i18n';

export type Locale = 'en' | 'es';
export const LOCALES: { value: Locale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
];
const KEY = 'svertik.lang';

/** The language to use: the saved choice if there is one, else the first of the browser's that we have. */
export function detectLocale(saved: string, languages: readonly string[]): Locale {
  if (saved === 'en' || saved === 'es') return saved;
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0];
    if (base === 'es') return 'es';
    if (base === 'en') return 'en';
  }
  return 'en';
}

function saved(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export const locale: Locale = detectLocale(saved(), typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]);

/**
 * Loads this language's tables (nothing for English). Call it before the interface is imported.
 * `effects`: also the effects' help (the editor shows it; Play doesn't need it).
 */
export async function loadLocale(effects = false): Promise<void> {
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  if (locale !== 'es') return;
  const [{ ES }, help] = await Promise.all([import('./i18n/es'), effects ? import('./i18n/es-effects') : null]);
  setTranslations(help ? { ...ES, ...help.ES_EFFECTS } : ES);
}

/** The person's choice: remembered, and the page reloads in it (the scene is kept in the tab). */
export function chooseLocale(next: Locale): void {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* no storage: it applies to this load only */
  }
  if (next !== locale) location.reload();
}
