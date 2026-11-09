<script lang="ts">
  import { Collapsible } from 'bits-ui';
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    open?: boolean;
    action?: Snippet;
    children?: Snippet;
  }
  let { title, open = $bindable(true), action, children }: Props = $props();
</script>

<Collapsible.Root bind:open class="sv-section">
  <div class="head">
    <Collapsible.Trigger class="sv-section-trigger">
      <span class="chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
      {title}
    </Collapsible.Trigger>
    {#if action}<span class="action">{@render action()}</span>{/if}
  </div>
  <Collapsible.Content>{@render children?.()}</Collapsible.Content>
</Collapsible.Root>

<style>
  .head { display: flex; align-items: center; height: var(--sv-size-row); padding-right: var(--sv-space-8); }
  :global(.sv-section-trigger) {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--sv-space-6);
    height: 100%;
    padding: 0 var(--sv-space-8);
    font: inherit;
    font-weight: var(--sv-font-weight-bold);
    color: var(--sv-text-secondary);
    background: none;
    border: 0;
    text-align: left;
    cursor: pointer;
  }
  :global(.sv-section-trigger:hover) { color: var(--sv-text-primary); }
  .chevron { width: 8px; color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .action { display: flex; color: var(--sv-text-muted); }
</style>
