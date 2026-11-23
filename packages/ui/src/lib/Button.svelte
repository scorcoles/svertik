<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';

  interface Props extends HTMLButtonAttributes {
    label: string;
    kind?: 'primary' | 'secondary';
    iconAfter?: IconName;
  }
  let { label, kind = 'secondary', type = 'button', iconAfter, class: className = '', ...rest }: Props = $props();
</script>

<button class={`sv-button ${className}`} data-kind={kind} {type} {...rest}>
  <span>{label}</span>
  {#if iconAfter}<Icon name={iconAfter} size={12} />{/if}
</button>

<style>
  .sv-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sv-space-8);
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
