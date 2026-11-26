// The last formula field the user focused, so a reference panel can insert names into it.
// Focus moves to the panel on click, so the field is remembered on focus and kept until it
// disappears from the page (the action's destroy).

import { getContext, setContext, untrack } from 'svelte';

type Field = HTMLInputElement | HTMLTextAreaElement;
/** A formula field: a text field, or a button showing the formula that opens it in the larger editor. */
type FormulaElement = Field | HTMLElement;
const isText = (el: FormulaElement): el is Field => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;

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
  /** Where the field is (object, effect…), read when it opens: the editor shows it before the label. */
  where?: () => string[];
}

const WHERE = Symbol('sv-formula-where');
/**
 * Says where the formula fields inside this component are, for the formula editor's title (Object › Effect).
 * Call it while the component is created; nested components can say it again, more precisely.
 */
export function setFormulaWhere(where: () => string[]) { setContext(WHERE, where); }
/** Where the formula fields of the calling component are (see `setFormulaWhere`). */
export function formulaWhereOf(): (() => string[]) | undefined { return getContext(WHERE); }

/** A formula open in the larger editor: whose it is, what it says now, and how to apply a change. */
export interface FormulaEditing {
  label: string;
  value: string;
  template: boolean;
  commit: (next: string) => void;
  /** The field it came from: when that field goes away (another selection), the editor closes. */
  owner: FormulaElement;
  /** Where that field is (Object › Effect), before its label. */
  where: string[];
}

const state = $state<{ el: Field | null; options: FormulaFieldOptions | null }>({ el: null, options: null });
const fields = new WeakMap<FormulaElement, FormulaFieldOptions>();
const editing = $state<{ current: FormulaEditing | null }>({ current: null });

/** The formula open in the larger editor (an app renders it as a panel), or null. */
export const formulaEditor = {
  get current() { return editing.current; },
  close() { editing.current = null; },
};

/** Opens a formula field in the larger editor (its expand button, or ⌘/Ctrl+Enter in the field). */
export function expandFormula(el: FormulaElement | null | undefined): boolean {
  const options = el ? fields.get(el) : undefined;
  if (!el || !options || options.disabled || options.noExpand) return false;
  const where = untrack(() => (options.where?.() ?? []).filter(Boolean));
  editing.current = { label: options.label, value: options.value ?? (isText(el) ? el.value : ''), template: !!options.template, commit: options.commit, owner: el, where };
  return true;
}

/** The field a reference panel would insert into, or null. */
export const formulaTarget = {
  get label() {
    return state.el?.isConnected ? state.options?.label ?? null : null;
  },
};

/** Marks an input or textarea as a formula field (`use:formulaField={{ label, commit }}`). */
export function formulaField(el: FormulaElement, options: FormulaFieldOptions) {
  let current = options;
  fields.set(el, options);
  const focus = () => {
    // Only a text field takes names from a reference panel (a formula button opens the editor instead).
    if (current.disabled || !isText(el)) return;
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
      // The open editor follows the field: an undo, or a change made elsewhere, shows up in it. (Untracked: the
      // action's update runs in an effect, which must not depend on the editor state it writes.)
      untrack(() => {
        const open = editing.current;
        if (open?.owner !== el) return;
        if (next.disabled) editing.current = null;
        else editing.current = { ...open, label: next.label, commit: next.commit, template: !!next.template, value: next.value ?? open.value };
      });
      if (state.el !== el) return;
      if (next.disabled) state.el = state.options = null;
      else state.options = next;
    },
    destroy() {
      el.removeEventListener('focus', focus);
      el.removeEventListener('keydown', key);
      fields.delete(el);
      untrack(() => { if (editing.current?.owner === el) editing.current = null; });
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
