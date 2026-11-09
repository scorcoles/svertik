<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';

  interface Props extends HTMLButtonAttributes {
    icon: IconName;
    /** Nombre accesible y tooltip. */
    label: string;
    active?: boolean;
  }
  let { icon, label, active = false, type = 'button', ...rest }: Props = $props();
</script>

<button class="sv-icon-button" {type} aria-label={label} title={label} data-active={active || undefined} {...rest}>
  <Icon name={icon} />
</button>

<style>
  .sv-icon-button {
    flex: none;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    color: var(--sv-text-secondary);
    background: none;
    border: 0;
    border-radius: var(--sv-radius-none);
    cursor: pointer;
  }
  .sv-icon-button:hover { color: var(--sv-text-primary); background: var(--sv-surface-hover); }
  .sv-icon-button[data-active],
  .sv-icon-button[aria-expanded='true'] { color: var(--sv-accent-fill); background: var(--sv-accent-selection); }
  .sv-icon-button:disabled { opacity: 0.35; cursor: default; background: none; color: var(--sv-text-secondary); }
</style>
