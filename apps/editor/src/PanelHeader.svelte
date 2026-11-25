<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '@svertik/ui';

  // Header of an inspector panel (Stack, Properties, Layers): its title folds and unfolds it; the
  // actions sit on the right.
  interface Props {
    title: string;
    open: boolean;
    ontoggle: (open: boolean) => void;
    /** Muted text after the title (a count). */
    detail?: string;
    controls?: string;
    children?: Snippet;
  }
  let { title, open, ontoggle, detail, controls, children }: Props = $props();
</script>

<header class="panel-header">
  <button type="button" class="toggle" aria-expanded={open} aria-controls={controls} title={open ? t('Fold {name}', { name: title }) : t('Unfold {name}', { name: title })} onclick={() => ontoggle(!open)}>
    <span class="chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
    <span class="title">{title}</span>
    {#if detail}<span class="detail">{detail}</span>{/if}
  </button>
  {#if children}<div class="actions">{@render children()}</div>{/if}
</header>

<style>
  .panel-header { display: flex; align-items: center; gap: var(--sv-space-4); height: 28px; padding-right: var(--sv-space-4); flex: none; }
  .toggle {
    flex: 1;
    min-width: 0;
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
  .toggle:hover { color: var(--sv-text-primary); }
  .toggle:focus-visible { outline-offset: -2px; }
  .chevron { width: 8px; color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .detail { color: var(--sv-text-muted); font-weight: normal; font-size: var(--sv-font-size-10); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .actions { display: flex; align-items: center; gap: var(--sv-space-4); }
</style>
