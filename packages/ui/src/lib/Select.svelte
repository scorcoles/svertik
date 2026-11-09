<script lang="ts">
  import { Select } from 'bits-ui';

  interface Props {
    value: string;
    options: readonly string[];
    label?: string;
    width?: string;
    onchange?: (value: string) => void;
  }
  let { value = $bindable(), options, label, width = '132px', onchange }: Props = $props();
  const items = $derived(options.map((o) => ({ value: o, label: o })));
</script>

<Select.Root type="single" bind:value {items} onValueChange={(v) => onchange?.(v)}>
  <Select.Trigger class="sv-select" aria-label={label} style="width: {width}">
    <span>{value}</span>
    <span class="chevron" aria-hidden="true">▾</span>
  </Select.Trigger>
  <Select.Portal>
    <Select.Content class="sv-select-content" sideOffset={2} style="min-width: {width}">
      <Select.Viewport>
        {#each items as item (item.value)}
          <Select.Item value={item.value} label={item.label} class="sv-select-item">{item.label}</Select.Item>
        {/each}
      </Select.Viewport>
    </Select.Content>
  </Select.Portal>
</Select.Root>

<style>
  :global(.sv-select) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sv-space-4);
    height: 20px;
    padding: 0 var(--sv-space-6);
    font: inherit;
    color: var(--sv-text-primary);
    background: var(--sv-surface-field);
    border: var(--sv-border-1) solid var(--sv-rule-default);
    border-radius: var(--sv-radius-none);
    cursor: pointer;
  }
  :global(.sv-select:hover) { border-color: var(--sv-rule-strong); }
  :global(.sv-select .chevron) { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  :global(.sv-select-content) {
    z-index: 50;
    padding: var(--sv-space-2) 0;
    font-family: var(--sv-font-mono);
    font-size: var(--sv-font-size-11);
    background: var(--sv-surface-raised);
    border: var(--sv-border-1) solid var(--sv-rule-strong);
  }
  :global(.sv-select-item) {
    height: 20px;
    padding: 0 var(--sv-space-8);
    display: flex;
    align-items: center;
    color: var(--sv-text-primary);
    cursor: pointer;
  }
  :global(.sv-select-item[data-highlighted]) { background: var(--sv-surface-hover); }
  :global(.sv-select-item[data-selected]) { color: var(--sv-accent-fill); }
</style>
