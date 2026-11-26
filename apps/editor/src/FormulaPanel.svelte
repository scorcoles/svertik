<script lang="ts">
  import { t } from '@svertik/ui';
  import { IconButton, formulaEditor, formulaField } from '@svertik/ui';
  import { validateExpression } from '@svertik/engine';
  import TextZoom from './TextZoom.svelte';
  import CopyButton from './CopyButton.svelte';
  import type { Editor } from './editor.svelte';
  import { highlightFormula } from './formula-highlight';

  // The formula editor: any ƒx field (a parameter, a variable, a prop, a per-copy value) opened large, to read and
  // write long formulas over several lines. It edits the field it came from, live, and closes when that field goes.
  let { editor, maximized = false, onmaximize, onclose, oncopy }: { editor: Editor; maximized?: boolean; onmaximize?: () => void; onclose?: () => void; oncopy?: (text: string, what: string) => void | boolean | Promise<void | boolean> } = $props();
  let field = $state<HTMLTextAreaElement>();
  let layer = $state<HTMLPreElement>();
  const open = $derived(formulaEditor.current);
  // What the field shows, coloured in a layer under it (the field's own text is transparent; its caret is not).
  let shown = $state('');
  const coloured = $derived(open?.template ? null : highlightFormula(shown));
  const error = $derived(open && !open.template ? validateExpression(open.value) : null);

  // A change from elsewhere (undo, the field itself) shows here; what is being typed here is left alone.
  $effect(() => {
    const value = open?.value ?? '';
    if (field && field.value !== value) field.value = value;
    shown = field?.value ?? value;
  });
  const follow = () => { if (layer && field) { layer.scrollTop = field.scrollTop; layer.scrollLeft = field.scrollLeft; } };
  // Escape gives the focus back to the field it was opened from.
  function close() {
    const owner = open?.owner;
    editor.flush();
    formulaEditor.close();
    onclose?.();
    if (owner?.isConnected) owner.focus({ preventScroll: true });
  }
  // Each formula opened here takes the focus, the caret at its end: ready to type.
  $effect(() => {
    void open?.owner;
    if (!field) return;
    field.focus({ preventScroll: true });
    field.setSelectionRange(field.value.length, field.value.length);
  });
</script>

{#if open}
<section class="formula" aria-label={t('Formula editor')}>
  <header><strong>ƒx</strong><span class="where">{#each open.where as part}{part}<i>›</i>{/each}<b>{open.label}</b></span>
    <TextZoom value={editor.textZoom} onchange={(v) => editor.setTextZoom(v)} />
    <button type="button" aria-pressed={editor.fxOpen} title={t('Variables and functions; a click inserts them here')} onclick={() => (editor.fxOpen = !editor.fxOpen)}>{t('Reference')}</button>
    {#if onmaximize}<IconButton icon={maximized ? 'restore' : 'maximize'} label={maximized ? t('Restore editor layout') : t('Use all available space for the formula')} aria-pressed={maximized} onclick={onmaximize} />{/if}
    <IconButton icon="down" label={t('Close the formula editor')} onclick={close} />
  </header>
  <div class="body">
    <div class="editor sv-writing-theme" data-sv-theme="dark" class:coloured={!!coloured} style:font-size={`${11 * editor.textZoom / 100}px`}>
      {#if coloured !== null}<pre bind:this={layer} class="layer" aria-hidden="true">{@html coloured}</pre>{/if}
      <textarea
        bind:this={field}
        aria-label={t('Formula for {name}', { name: open.label })}
        aria-invalid={error ? 'true' : undefined}
        spellcheck="false"
        oninput={(e) => { shown = e.currentTarget.value; open.commit(e.currentTarget.value); follow(); }}
        onscroll={follow}
        onblur={() => editor.flush()}
        use:formulaField={{ label: open.label, template: open.template, value: open.value, noExpand: true, commit: (next) => open.commit(next) }}
        onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Escape') close(); }}
      ></textarea>
      <CopyButton label={t('Copy formula')} disabled={!open.value || !oncopy} onclick={() => oncopy?.(open.value, t('Formula'))} />
    </div>
    <aside>
      {#if error}<p class="error" role="status">{error}</p>{:else}<p class="ok">{t('Valid formula.')}</p>{/if}
      <p>{t('Break lines and indent as you like: spaces and line breaks don’t change the result.')}</p>
      <p>{t('Changes apply as you type. Escape closes and goes back to the field.')}</p>
    </aside>
  </div>
</section>
{/if}

<style>
  .formula { display: flex; flex-direction: column; min-height: 0; background: var(--sv-surface-panel); color: var(--sv-text-primary); border-top: 1px solid var(--sv-rule-default); font: 11px var(--sv-font-mono); }
  header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 4px 8px; }
  .where { flex: 1; min-width: 0; overflow: hidden; color: var(--sv-text-muted); text-overflow: ellipsis; white-space: nowrap; }
  .where i { padding: 0 6px; font-style: normal; color: var(--sv-text-disabled); }
  .where b { font-weight: inherit; color: var(--sv-text-primary); }
  .body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(200px, 30%); gap: 8px; min-height: 0; flex: 1; padding: 0 8px 8px; }
  .editor { position: relative; min-height: 0; font-family: var(--sv-font-mono); background: none; }
  /* The coloured layer and the field share every metric, so each letter sits exactly over its colour. */
  textarea, .layer { box-sizing: border-box; height: 100%; width: 100%; min-height: 0; margin: 0; padding: 8px; font: inherit; font-variant-ligatures: none; line-height: 1.5; tab-size: 2; white-space: pre-wrap; scrollbar-gutter: stable; overflow-wrap: anywhere; border: 1px solid var(--sv-rule-default); }
  textarea { position: relative; resize: none; background: var(--sv-surface-field); color: var(--sv-text-primary); }
  .coloured textarea { background: transparent; color: transparent; caret-color: var(--sv-accent-fill); }
  .coloured textarea::selection { color: transparent; background: color-mix(in srgb, var(--sv-text-primary) 30%, transparent); }
  .layer { position: absolute; inset: 0; overflow: hidden; color: var(--sv-code-property); background: var(--sv-surface-field); pointer-events: none; }
  textarea[aria-invalid='true'] { border-color: var(--sv-signal-error); }
  .layer :global(.fx-function) { color: var(--sv-code-keyword); }
  .layer :global(.fx-variable) { color: var(--sv-code-property); }
  .layer :global(.fx-number) { color: var(--sv-code-number); }
  .layer :global(.fx-string) { color: var(--sv-code-string); }
  .layer :global(.fx-operator) { color: var(--sv-code-punctuation); }
  .layer :global(.fx-depth-0) { color: var(--sv-code-punctuation); }
  .layer :global(.fx-depth-1) { color: var(--sv-code-keyword); }
  .layer :global(.fx-depth-2) { color: var(--sv-code-number); }
  .layer :global(.fx-unknown) { color: var(--sv-code-property); text-decoration: underline wavy var(--sv-signal-error); text-underline-offset: 3px; }
  aside { overflow: auto; }
  button { border: 1px solid var(--sv-rule-strong); border-radius: 0; color: var(--sv-text-primary); background: var(--sv-surface-panel); font: inherit; padding: 4px 6px; cursor: pointer; }
  button:hover, button[aria-pressed='true'] { border-color: var(--sv-accent-fill); }
  p { color: var(--sv-text-muted); line-height: 1.5; margin: 8px 0; }
  .error { color: var(--sv-signal-error); }
  .ok { color: var(--sv-text-secondary); }
</style>
