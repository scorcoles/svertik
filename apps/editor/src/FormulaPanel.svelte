<script lang="ts">
  import { t } from '@svertik/ui';
  import { IconButton, formulaEditor, formulaField } from '@svertik/ui';
  import { validateExpression } from '@svertik/engine';
  import { onMount } from 'svelte';
  import TextZoom from './TextZoom.svelte';
  import CopyButton from './CopyButton.svelte';
  import type { Editor } from './editor.svelte';

  // The formula editor: any ƒx field (a parameter, a variable, a prop, a per-copy value) opened large, to read and
  // write long formulas over several lines. It edits the field it came from, live, and closes when that field goes.
  let { editor, maximized = false, onmaximize, onclose, oncopy }: { editor: Editor; maximized?: boolean; onmaximize?: () => void; onclose?: () => void; oncopy?: (text: string, what: string) => void | boolean | Promise<void | boolean> } = $props();
  let field = $state<HTMLTextAreaElement>();
  const open = $derived(formulaEditor.current);
  const error = $derived(open && !open.template ? validateExpression(open.value) : null);

  // A change from elsewhere (undo, the field itself) shows here; what is being typed here is left alone.
  $effect(() => {
    const value = open?.value ?? '';
    if (field && field.value !== value) field.value = value;
  });
  function close() { editor.flush(); formulaEditor.close(); onclose?.(); }
  onMount(() => field?.focus({ preventScroll: true }));
</script>

{#if open}
<section class="formula" aria-label={t('Formula editor')}>
  <header><strong>ƒx</strong><span>{open.label}</span>
    <TextZoom value={editor.textZoom} onchange={(v) => editor.setTextZoom(v)} />
    <button type="button" aria-pressed={editor.fxOpen} title={t('Variables and functions; a click inserts them here')} onclick={() => (editor.fxOpen = !editor.fxOpen)}>{t('Reference')}</button>
    {#if onmaximize}<IconButton icon={maximized ? 'restore' : 'maximize'} label={maximized ? t('Restore editor layout') : t('Use all available space for the formula')} aria-pressed={maximized} onclick={onmaximize} />{/if}
    <IconButton icon="down" label={t('Close the formula editor')} onclick={close} />
  </header>
  <div class="body">
    <div class="editor">
      <textarea
        bind:this={field}
        style:font-size={`${11 * editor.textZoom / 100}px`}
        class="sv-writing-theme"
        data-sv-theme="dark"
        aria-label={t('Formula for {name}', { name: open.label })}
        aria-invalid={error ? 'true' : undefined}
        spellcheck="false"
        oninput={(e) => open.commit(e.currentTarget.value)}
        onblur={() => editor.flush()}
        use:formulaField={{ label: open.label, template: open.template, value: open.value, noExpand: true, commit: (next) => open.commit(next) }}
        onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Escape') close(); }}
      ></textarea>
      <CopyButton label={t('Copy formula')} disabled={!open.value || !oncopy} onclick={() => oncopy?.(open.value, t('Formula'))} />
    </div>
    <aside>
      {#if error}<p class="error" role="status">{error}</p>{:else}<p class="ok">{t('Valid formula.')}</p>{/if}
      <p>{t('Break lines and indent as you like: spaces and line breaks don’t change the result.')}</p>
      <p>{t('Changes apply as you type. ⌘/Ctrl+Enter in any ƒx field opens it here; Escape closes.')}</p>
    </aside>
  </div>
</section>
{/if}

<style>
  .formula { display: flex; flex-direction: column; min-height: 0; background: var(--sv-surface-panel); color: var(--sv-text-primary); border-top: 1px solid var(--sv-rule-default); font: 11px var(--sv-font-mono); }
  header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 4px 8px; }
  header span { flex: 1; overflow: hidden; color: var(--sv-text-muted); text-overflow: ellipsis; white-space: nowrap; }
  .body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(200px, 30%); gap: 8px; min-height: 0; flex: 1; padding: 0 8px 8px; }
  .editor { position: relative; min-height: 0; }
  textarea { height: 100%; resize: none; width: 100%; min-height: 0; padding: 8px; font: inherit; line-height: 1.5; border: 1px solid var(--sv-rule-default); background: var(--sv-surface-field); color: var(--sv-text-primary); tab-size: 2; }
  textarea[aria-invalid='true'] { border-color: var(--sv-signal-error); }
  aside { overflow: auto; }
  button { border: 1px solid var(--sv-rule-strong); border-radius: 0; color: var(--sv-text-primary); background: var(--sv-surface-panel); font: inherit; padding: 4px 6px; cursor: pointer; }
  button:hover, button[aria-pressed='true'] { border-color: var(--sv-accent-fill); }
  p { color: var(--sv-text-muted); line-height: 1.5; margin: 8px 0; }
  .error { color: var(--sv-signal-error); }
  .ok { color: var(--sv-text-secondary); }
</style>
