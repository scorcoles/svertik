<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    meta?: string;
    width?: string;
    actions?: Snippet;
    children?: Snippet;
  }
  let { title, meta, width = '260px', actions, children }: Props = $props();
</script>

<section class="sv-panel" style:width aria-label={title}>
  <header>
    <h2>{title}</h2>
    {#if actions}{@render actions()}{:else if meta}<span class="meta">{meta}</span>{/if}
  </header>
  {@render children?.()}
</section>

<style>
  .sv-panel {
    display: flex;
    flex-direction: column;
    background: var(--sv-surface-panel);
    border: var(--sv-border-1) solid var(--sv-rule-default);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sv-space-8);
    height: var(--sv-size-row);
    padding: 0 var(--sv-space-8);
  }
  h2 { margin: 0; font-size: var(--sv-font-size-11); font-weight: var(--sv-font-weight-bold); }
  .meta { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
</style>
