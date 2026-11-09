<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends HTMLButtonAttributes {
    label: string;
    kind?: 'primary' | 'secondary';
  }
  let { label, kind = 'secondary', type = 'button', ...rest }: Props = $props();
</script>

<button class="sv-button" data-kind={kind} {type} {...rest}>{label}</button>

<style>
  .sv-button {
    height: var(--sv-size-row);
    padding: 0 var(--sv-space-12);
    font: inherit;
    font-weight: var(--sv-font-weight-bold);
    border-radius: var(--sv-radius-none);
    cursor: pointer;
    border: var(--sv-border-1) solid var(--sv-rule-strong);
    background: var(--sv-surface-panel);
    color: var(--sv-text-primary);
  }
  .sv-button:hover { background: var(--sv-surface-hover); }
  .sv-button[data-kind='primary'] {
    background: var(--sv-accent-fill);
    border-color: var(--sv-accent-fill);
    color: var(--sv-accent-on);
  }
  .sv-button[data-kind='primary']:hover { filter: brightness(1.1); }
  .sv-button[aria-pressed='true'] {
    background: var(--sv-accent-selection);
    border-color: var(--sv-accent-fill);
    color: var(--sv-accent-fill);
  }
  .sv-button:disabled { opacity: 0.4; cursor: default; }
</style>
