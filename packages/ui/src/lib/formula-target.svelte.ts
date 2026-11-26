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
  /** The formula as it is now (the field may be showing it on one line): what a larger editor opens with. */
  value?: string;
  /** The larger editor's own field: it takes names from a reference panel but doesn't open itself again. */
  noExpand?: boolean;
}

/** A formula open in the larger editor: whose it is, what it says now, and how to apply a change. */
export interface FormulaEditing {
  label: string;
  value: string;
  template: boolean;
  commit: (next: string) => void;
  /** The field it came from: when that field goes away (another selection), the editor closes. */
  owner: Field;
}

const state = $state<{ el: Field | null; options: FormulaFieldOptions | null }>({ el: null, options: null });
const fields = new WeakMap<Field, FormulaFieldOptions>();
const editing = $state<{ current: FormulaEditing | null }>({ current: null });

/** The formula open in the larger editor (an app renders it as a panel), or null. */
export const formulaEditor = {
  get current() { return editing.current; },
  close() { editing.current = null; },
};

/** Opens a formula field in the larger editor (its expand button, or ⌘/Ctrl+Enter in the field). */
export function expandFormula(el: Field | null | undefined): boolean {
  const options = el ? fields.get(el) : undefined;
  if (!el || !options || options.disabled || options.noExpand) return false;
  editing.current = { label: options.label, value: options.value ?? el.value, template: !!options.template, commit: options.commit, owner: el };
  return true;
}

/** The field a reference panel would insert into, or null. */
export const formulaTarget = {
  get label() {
    return state.el?.isConnected ? state.options?.label ?? null : null;
  },
};

/** Marks an input or textarea as a formula field (`use:formulaField={{ label, commit }}`). */
export function formulaField(el: Field, options: FormulaFieldOptions) {
  let current = options;
  fields.set(el, options);
  const focus = () => {
    if (current.disabled) return;
    state.el = el;
    state.options = current;
  };
  const key = (event: Event) => {
    const e = event as KeyboardEvent;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && expandFormula(el)) e.preventDefault();
  };
  el.addEventListener('focus', focus);
  el.addEventListener('keydown', key);
  return {
    update(next: FormulaFieldOptions) {
      current = next;
      fields.set(el, next);
      // The open editor follows the field: an undo, or a change made elsewhere, shows up in it.
      const open = editing.current;
      if (open?.owner === el) {
        if (next.disabled) editing.current = null;
        else editing.current = { ...open, label: next.label, commit: next.commit, template: !!next.template, value: next.value ?? open.value };
      }
      if (state.el !== el) return;
      if (next.disabled) state.el = state.options = null;
      else state.options = next;
    },
    destroy() {
      el.removeEventListener('focus', focus);
      el.removeEventListener('keydown', key);
      fields.delete(el);
      if (editing.current?.owner === el) editing.current = null;
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
