<script lang="ts">
  import { Select } from 'bits-ui';
  import type { SelectGroup, SelectOption } from './types';

  interface Props {
    value: string;
    /** Plain options, options with their own label, or groups of them under a heading. */
    options: readonly (SelectOption | SelectGroup)[];
    label?: string;
    width?: string;
    onchange?: (value: string) => void;
  }
  let { value = $bindable(), options, label, width = '132px', onchange }: Props = $props();
  const entry = (o: SelectOption) => (typeof o === 'string' ? { value: o, label: o } : o);
  const isGroup = (o: SelectOption | SelectGroup): o is SelectGroup => typeof o === 'object' && 'group' in o;
  const items = $derived(options.flatMap((o) => (isGroup(o) ? o.options : [o])).map(entry));
  const shown = $derived(items.find((i) => i.value === value)?.label ?? value);
</script>

{#snippet item(option: SelectOption)}
  {@const o = entry(option)}
  <Select.Item value={o.value} label={o.label} class="sv-select-item">{o.label}</Select.Item>
{/snippet}

<Select.Root type="single" bind:value {items} onValueChange={(v) => onchange?.(v)}>
  <Select.Trigger class="sv-select" aria-label={label} style="width: {width}">
    <span>{shown}</span>
    <span class="chevron" aria-hidden="true">▾</span>
  </Select.Trigger>
  <Select.Portal>
    <Select.Content class="sv-select-content" sideOffset={2} style="min-width: {width}">
      <Select.Viewport>
        {#each options as o, i (isGroup(o) ? `group:${i}:${o.group}` : entry(o).value)}
          {#if isGroup(o)}
            <Select.Group class="sv-select-group">
              <Select.GroupHeading class="sv-select-heading">{o.group}</Select.GroupHeading>
              {#each o.options as option (entry(option).value)}{@render item(option)}{/each}
            </Select.Group>
          {:else}
            {@render item(o)}
          {/if}
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
  :global(.sv-select-group + .sv-select-group),
  :global(.sv-select-item + .sv-select-group) { border-top: var(--sv-border-1) solid var(--sv-rule-default); margin-top: var(--sv-space-2); padding-top: var(--sv-space-2); }
  :global(.sv-select-heading) {
    height: 18px;
    padding: 0 var(--sv-space-8);
    display: flex;
    align-items: center;
    color: var(--sv-text-muted);
    font-size: var(--sv-font-size-10);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    cursor: default;
  }
  :global(.sv-select-group .sv-select-item) { padding-left: var(--sv-space-12); }
  :global(.sv-select-item[data-highlighted]) { background: var(--sv-surface-hover); }
  :global(.sv-select-item[data-selected]) { color: var(--sv-accent-fill); }
</style>
