<script lang="ts">
  import { ToggleGroup } from 'bits-ui';
  import Icon from './Icon.svelte';
  import type { SegmentOption } from './types';
  interface Props {
    value: string;
    options: readonly SegmentOption[];
    label?: string;
    onchange?: (value: string) => void;
  }
  let { value = $bindable(), options, label, onchange }: Props = $props();
</script>

<ToggleGroup.Root
  type="single"
  bind:value={() => value, (v) => { if (v) { value = v; onchange?.(v); } }}
  aria-label={label}
  class="sv-segmented"
>
  {#each options as o (o.value)}
    <ToggleGroup.Item value={o.value} aria-label={o.label} title={o.label} class="sv-segment" data-icon={o.icon ? '' : undefined}>
      {#if o.icon}<Icon name={o.icon} />{:else}{o.label}{/if}
    </ToggleGroup.Item>
  {/each}
</ToggleGroup.Root>

<style>
  :global(.sv-segmented) { display: inline-flex; border: var(--sv-border-1) solid var(--sv-rule-default); }
  :global(.sv-segment) {
    min-width: 32px;
    height: 18px;
    padding: 0 var(--sv-space-8);
    font: inherit;
    color: var(--sv-text-muted);
    background: var(--sv-surface-field);
    border: 0;
    border-radius: var(--sv-radius-none);
    cursor: pointer;
  }
  :global(.sv-segment[data-icon]) { display: inline-grid; place-items: center; padding: 0; }
  :global(.sv-segment:hover) { color: var(--sv-text-secondary); }
  :global(.sv-segment[data-state='on']) { color: var(--sv-accent-fill); background: var(--sv-surface-raised); }
</style>
