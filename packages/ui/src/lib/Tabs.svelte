<script lang="ts">
  import { Tabs } from 'bits-ui';
  import type { Snippet } from 'svelte';

  interface Props {
    value: string;
    tabs: readonly string[];
    children?: Snippet<[string]>;
  }
  let { value = $bindable(), tabs, children }: Props = $props();
</script>

<Tabs.Root bind:value class="sv-tabs">
  <Tabs.List class="sv-tabs-list">
    {#each tabs as tab (tab)}
      <Tabs.Trigger value={tab} class="sv-tab">{tab}</Tabs.Trigger>
    {/each}
  </Tabs.List>
  {#each tabs as tab (tab)}
    <Tabs.Content value={tab}>{@render children?.(tab)}</Tabs.Content>
  {/each}
</Tabs.Root>

<style>
  :global(.sv-tabs-list) { display: flex; }
  :global(.sv-tab) {
    flex: 1;
    height: var(--sv-size-row);
    padding: 0 var(--sv-space-12);
    font: inherit;
    color: var(--sv-text-muted);
    background: var(--sv-surface-field);
    border: 0;
    border-radius: var(--sv-radius-none);
    cursor: pointer;
  }
  :global(.sv-tab:hover) { color: var(--sv-text-secondary); }
  :global(.sv-tab[data-state='active']) { color: var(--sv-text-primary); background: var(--sv-surface-raised); }
</style>
