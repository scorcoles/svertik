<script lang="ts">
  import { Checkbox } from 'bits-ui';

  interface Props {
    checked: boolean;
    label?: string;
    id?: string;
    disabled?: boolean;
    onchange?: (checked: boolean) => void;
    /** -1 keeps it out of the tab order (e.g. inside a tree row that has its own keyboard shortcut). */
    tabindex?: number;
  }
  let { checked = $bindable(), label, id, disabled = false, onchange, tabindex }: Props = $props();
</script>

<Checkbox.Root
  bind:checked
  {id}
  {disabled}
  aria-label={label}
  {tabindex}
  onCheckedChange={(v) => onchange?.(v)}
  class="sv-checkbox"
>
  {#snippet children({ checked: on })}
    {#if on}<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.25l2.25 2.25 4.75-5" /></svg>{/if}
  {/snippet}
</Checkbox.Root>

<style>
  :global(.sv-checkbox) {
    flex: none;
    width: 12px;
    height: 12px;
    padding: 0;
    border: var(--sv-border-1) solid var(--sv-rule-strong);
    border-radius: var(--sv-radius-none);
    background: none;
    cursor: pointer;
  }
  :global(.sv-checkbox:hover) { border-color: var(--sv-text-muted); }
  :global(.sv-checkbox) { display: inline-grid; place-items: center; }
  :global(.sv-checkbox[data-state='checked']) { border-color: var(--sv-accent-fill); }
  :global(.sv-checkbox svg) { width: 10px; height: 10px; fill: none; stroke: var(--sv-accent-fill); stroke-width: 1.5; stroke-linecap: square; }
  :global([data-sv-theme='light'] .sv-checkbox[data-state='checked']) { background: var(--sv-accent-fill); border-color: #256f60; }
  :global([data-sv-theme='light'] .sv-checkbox[data-state='checked'] svg) { stroke: #000; }
  :global(.sv-checkbox:disabled) { opacity: 0.4; cursor: default; }
</style>
