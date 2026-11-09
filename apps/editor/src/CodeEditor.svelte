<script lang="ts">
  import { onMount } from 'svelte';
  import { javascript } from '@codemirror/lang-javascript';
  import { json } from '@codemirror/lang-json';
  import { xml } from '@codemirror/lang-xml';
  import { codeFolding, foldEffect, foldGutter, HighlightStyle, syntaxHighlighting, bracketMatching, indentOnInput } from '@codemirror/language';
  import { Compartment, EditorState, RangeSetBuilder } from '@codemirror/state';
  import { Decoration, EditorView, highlightActiveLine, keymap, lineNumbers, drawSelection } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
  import { tags as t } from '@lezer/highlight';

  interface Props {
    value: string;
    lang: 'json' | 'js' | 'svg';
    readonly?: boolean;
    /** Línea (1…) con error, para marcarla. */
    errorLine?: number | null;
    /** Rango a plegar cada vez que el texto llega de fuera (el SVG de origen). */
    fold?: [number, number] | null;
    label: string;
    onchange?: (text: string) => void;
    oncursor?: (line: number, col: number) => void;
  }
  let { value, lang, readonly = false, errorLine = null, fold = null, label, onchange, oncursor }: Props = $props();

  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let applying = false;
  const errorComp = new Compartment();
  const readonlyComp = new Compartment();

  const v = (name: string) => `var(--sv-${name})`;
  const style = HighlightStyle.define([
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword, t.operatorKeyword, t.tagName, t.bool, t.null], color: v('code-keyword') },
    { tag: [t.string, t.special(t.string), t.attributeValue], color: v('code-string') },
    { tag: [t.number], color: v('code-number') },
    { tag: [t.propertyName, t.variableName, t.attributeName, t.function(t.variableName)], color: v('code-property') },
    { tag: [t.comment, t.lineComment, t.blockComment], color: v('code-comment') },
    { tag: [t.punctuation, t.bracket, t.operator, t.separator, t.angleBracket], color: v('code-punctuation') },
  ]);

  const theme = EditorView.theme(
    {
      '&': { height: '100%', color: v('code-property'), backgroundColor: v('surface-field'), fontSize: '11px' },
      '.cm-scroller': { fontFamily: v('font-mono'), lineHeight: '1.6', fontVariantLigatures: 'none' },
      '.cm-content': { caretColor: v('accent-fill'), padding: '8px 0' },
      '.cm-gutters': { backgroundColor: v('surface-field'), color: v('code-gutter'), border: 'none' },
      '.cm-lineNumbers .cm-gutterElement': { padding: '0 12px 0 16px', minWidth: '40px' },
      '.cm-foldGutter .cm-gutterElement': { color: v('text-muted'), padding: '0 4px', cursor: 'pointer' },
      '.cm-activeLine': { backgroundColor: 'transparent' },
      '&.cm-focused .cm-activeLine': { backgroundColor: v('surface-panel') },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: `${v('accent-selection')} !important` },
      '&.cm-focused .cm-cursor': { borderLeftColor: v('accent-fill') },
      '&.cm-focused': { outline: 'none' },
      '.cm-foldPlaceholder': { backgroundColor: v('surface-raised'), border: 'none', color: v('text-secondary'), padding: '0 6px', margin: '0 2px' },
      '.cm-error-line': { backgroundColor: 'color-mix(in srgb, var(--sv-signal-error) 14%, transparent)', boxShadow: `inset 2px 0 ${v('signal-error')}` },
      '.cm-matchingBracket': { backgroundColor: v('surface-raised'), outline: 'none' },
    },
    { dark: true },
  );

  const errorDecoration = (state: EditorState, line: number | null) => {
    if (!line || line < 1 || line > state.doc.lines) return [];
    const b = new RangeSetBuilder<Decoration>();
    b.add(state.doc.line(line).from, state.doc.line(line).from, Decoration.line({ class: 'cm-error-line' }));
    return [EditorView.decorations.of(b.finish())];
  };

  const foldSource = () => {
    if (!view || !fold) return;
    const [from, to] = fold;
    if (to - from > 40) view.dispatch({ effects: foldEffect.of({ from, to }) });
  };

  onMount(() => {
    const language = lang === 'json' ? json() : lang === 'js' ? javascript() : xml();
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          codeFolding({ placeholderText: '…' }),
          foldGutter({ openText: '▾', closedText: '▸' }),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          highlightActiveLine(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          language,
          syntaxHighlighting(style),
          theme,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': label }),
          readonlyComp.of(EditorState.readOnly.of(readonly)),
          errorComp.of([]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !applying) onchange?.(u.state.doc.toString());
            if (u.selectionSet || u.docChanged) {
              const head = u.state.selection.main.head;
              const line = u.state.doc.lineAt(head);
              oncursor?.(line.number, head - line.from + 1);
            }
          }),
        ],
      }),
    });
    foldSource();
    return () => view?.destroy();
  });

  // Texto que llega de fuera (los paneles cambian la escena): solo si no se está escribiendo aquí.
  $effect(() => {
    const next = value;
    if (!view || view.hasFocus) return;
    const current = view.state.doc.toString();
    if (next === current) return;
    applying = true;
    view.dispatch({ changes: { from: 0, to: current.length, insert: next } });
    applying = false;
    foldSource();
  });

  $effect(() => {
    view?.dispatch({ effects: errorComp.reconfigure(errorDecoration(view.state, errorLine)) });
  });
  $effect(() => {
    view?.dispatch({ effects: readonlyComp.reconfigure(EditorState.readOnly.of(readonly)) });
  });
</script>

<div class="code-editor" bind:this={host}></div>

<style>
  .code-editor { height: 100%; min-height: 0; overflow: hidden; }
  .code-editor :global(.cm-editor) { height: 100%; }
</style>
