<script lang="ts">
  import { t } from './i18n';
  import Icon from './Icon.svelte';
  import { expandFormula } from './formula-target.svelte';

  /** Opens the formula field `field` in the larger editor (a panel the app shows). */
  let { field, label }: { field: HTMLInputElement | HTMLTextAreaElement | undefined; label: string } = $props();
</script>

<button
  class="formula-expand"
  type="button"
  aria-label={t('Edit {name} in the formula editor', { name: label })}
  title={t('Open in the formula editor (⌘/Ctrl+Enter)')}
  onpointerdown={(e) => e.preventDefault()}
  onclick={() => expandFormula(field)}
><Icon name="maximize" /></button>

<style>
  .formula-expand {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 16px;
    padding: 0;
    color: var(--sv-text-muted);
    background: none;
    border: 0;
    border-radius: 0;
    cursor: pointer;
  }
  .formula-expand :global(svg) { width: 10px; height: 10px; }
  .formula-expand:hover { color: var(--sv-accent-text); }
</style>
