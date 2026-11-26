<script lang="ts">
  import { t } from './i18n';
  import { expandFormula, formulaEditor, formulaField, formulaWhereOf } from './formula-target.svelte';

  /**
   * A formula in an inspector row: it shows the formula on one line and opens it in the formula editor, where it is
   * written. `open`: open it as soon as it appears (a field just turned into a formula), so typing can start there.
   */
  let { label, value, error = null, open = false, commit }: {
    label: string;
    value: string;
    error?: string | null;
    open?: boolean;
    commit: (next: string) => void;
  } = $props();
  let button = $state<HTMLButtonElement>();
  const where = formulaWhereOf();
  const editing = $derived(!!button && formulaEditor.current?.owner === button);
  $effect(() => { if (open && button) expandFormula(button); });
</script>

<button
  bind:this={button}
  class="formula-button"
  type="button"
  data-invalid={error || undefined}
  aria-pressed={editing}
  aria-label={t('Edit the formula of {name}', { name: label })}
  title={error ?? value}
  use:formulaField={{ label, value, commit, where }}
  onclick={() => expandFormula(button)}
>{value.replace(/\s+/g, ' ').trim() || '…'}</button>

<style>
  .formula-button {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    padding: 0;
    color: var(--sv-text-primary);
    background: none;
    border: 0;
    border-radius: 0;
    font: inherit;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: text;
  }
  .formula-button:hover,
  .formula-button[aria-pressed='true'] { color: var(--sv-accent-text); }
  .formula-button[data-invalid] { text-decoration: underline wavy var(--sv-signal-error); text-underline-offset: 3px; }
</style>
