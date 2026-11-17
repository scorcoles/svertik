// The last formula field the user focused, so a reference panel can insert names into it.
// Focus moves to the panel on click, so the field is remembered on focus and kept until it
// disappears from the page (the action's destroy).

type Field = HTMLInputElement | HTMLTextAreaElement;

export interface FormulaFieldOptions {
  /** Shown in the reference panel: "Insert into Position". */
  label: string;
  /** Applies the new text, as typing would. */
  commit: (next: string) => void;
  /** Text with live values: names go inside `{{…}}`. */
  template?: boolean;
  /** Not a formula field right now (text without live values). */
  disabled?: boolean;
}

const state = $state<{ el: Field | null; options: FormulaFieldOptions | null }>({ el: null, options: null });

/** The field a reference panel would insert into, or null. */
export const formulaTarget = {
  get label() {
    return state.el?.isConnected ? state.options?.label ?? null : null;
  },
};

/** Marks an input or textarea as a formula field (`use:formulaField={{ label, commit }}`). */
export function formulaField(el: Field, options: FormulaFieldOptions) {
  let current = options;
  const focus = () => {
    if (current.disabled) return;
    state.el = el;
    state.options = current;
  };
  el.addEventListener('focus', focus);
  return {
    update(next: FormulaFieldOptions) {
      current = next;
      if (state.el !== el) return;
      if (next.disabled) state.el = state.options = null;
      else state.options = next;
    },
    destroy() {
      el.removeEventListener('focus', focus);
      if (state.el === el) {
        state.el = null;
        state.options = null;
      }
    },
  };
}

/**
 * Inserts `text` at the caret of the last formula field, replacing its selection, and leaves
 * the caret `caretBack` characters before the end of what was inserted (inside a call's
 * parentheses). Returns false when there is no field to insert into.
 */
export function insertFormula(text: string, caretBack = 0): boolean {
  const { el, options } = state;
  if (!el?.isConnected || !options) return false;
  const token = options.template ? `{{${text}}}` : text;
  const back = caretBack + (options.template ? 2 : 0);
  const a = el.selectionStart ?? el.value.length;
  const b = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, a) + token + el.value.slice(b);
  el.value = next;
  options.commit(next);
  el.focus();
  const caret = a + token.length - back;
  el.setSelectionRange(caret, caret);
  return true;
}
