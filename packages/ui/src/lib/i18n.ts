// Interface translations. Interface text is written in English inside `t()`; the host (the editor) hands over a
// table from English to its language before the interface loads, so `t()` returns the translation, or the
// English text itself when there is none. Changing language reloads the page: nothing has to re-render.

let table: Readonly<Record<string, string>> = {};

/** The translations to use, keyed by the English text (an empty table: English). */
export function setTranslations(translations: Readonly<Record<string, string>>): void {
  table = translations;
}

/**
 * `text` in the interface's language. `{name}` placeholders take `vars.name`, in the translation too, so a
 * sentence with values is one entry: `t('{count} copies', { count: 3 })`.
 */
export function t(text: string, vars?: Readonly<Record<string, string | number>>): string {
  const out = table[text] ?? text;
  return vars ? out.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole)) : out;
}
