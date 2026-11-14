<script lang="ts">
  import type { Editor } from './editor.svelte';
  import Attributes from './Attributes.svelte';
  import DocumentAttributes from './DocumentAttributes.svelte';
  import StackPanel from './StackPanel.svelte';

  let { editor, onreplace }: { editor: Editor; onreplace: () => void } = $props();
  let active = $state<'stack' | 'document'>('stack');

  function moveTab(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      active = active === 'stack' ? 'document' : 'stack';
      document.getElementById(`inspector-tab-${active}`)?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      active = event.key === 'Home' ? 'stack' : 'document';
      document.getElementById(`inspector-tab-${active}`)?.focus();
    }
  }
</script>

<section class="inspector-panel" aria-label="Inspector">
  <div class="tabs" role="tablist" aria-label="Inspector panels" tabindex="-1" onkeydown={moveTab}>
    <button id="inspector-tab-stack" type="button" role="tab" aria-selected={active === 'stack'} aria-controls="inspector-panel-stack" tabindex={active === 'stack' ? 0 : -1} onclick={() => (active = 'stack')}>Stack</button>
    <button id="inspector-tab-document" type="button" role="tab" aria-selected={active === 'document'} aria-controls="inspector-panel-document" tabindex={active === 'document' ? 0 : -1} onclick={() => (active = 'document')}>Document</button>
  </div>

  {#if active === 'stack'}
    <div id="inspector-panel-stack" class="panel stack-panel" role="tabpanel" aria-labelledby="inspector-tab-stack">
      <StackPanel {editor} />
      <Attributes {editor} {onreplace} />
    </div>
  {:else}
    <div id="inspector-panel-document" class="panel document-panel" role="tabpanel" aria-labelledby="inspector-tab-document">
      {#if editor.scene}
        <DocumentAttributes {editor} />
      {:else}
        <div class="empty"><p>No document yet.</p><p>Import or create a scene to edit its size and palette.</p></div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .inspector-panel { display: flex; flex: 1; flex-direction: column; min-height: 0; }
  .tabs { display: flex; flex: none; border-bottom: var(--sv-border-1) solid var(--sv-rule-default); }
  .tabs button {
    position: relative;
    flex: 1;
    height: 28px;
    padding: 0 var(--sv-space-8);
    font: inherit;
    color: var(--sv-text-muted);
    background: transparent;
    border: 0;
    cursor: pointer;
  }
  .tabs button:hover { color: var(--sv-text-primary); background: var(--sv-surface-hover); }
  .tabs button[aria-selected='true'] { color: var(--sv-text-primary); background: transparent; }
  .tabs button[aria-selected='true']::after { content: ''; position: absolute; right: var(--sv-space-8); bottom: -1px; left: var(--sv-space-8); height: 1px; background: color-mix(in srgb, var(--sv-accent-fill) 50%, var(--sv-surface-panel)); }
  .tabs button:focus-visible { outline-offset: -2px; }
  .panel { flex: 1; min-height: 0; overflow-y: auto; }
  .stack-panel { display: flex; flex-direction: column; }
  .document-panel { overflow-y: auto; }
  .empty { padding: var(--sv-space-12); color: var(--sv-text-muted); font-size: var(--sv-font-size-10); line-height: 1.5; }
  .empty p { margin: 0 0 var(--sv-space-4); }
</style>
