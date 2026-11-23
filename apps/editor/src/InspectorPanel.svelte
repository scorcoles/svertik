<script lang="ts">
  import type { Editor } from './editor.svelte';
  import Attributes from './Attributes.svelte';
  import DocumentAttributes from './DocumentAttributes.svelte';
  import StackPanel from './StackPanel.svelte';
  import LayersPanel from './LayersPanel.svelte';

  let { editor, onreplace, active = $bindable<'stack' | 'document'>('stack') }: { editor: Editor; onreplace: () => void; active?: 'stack' | 'document' } = $props();

  // Divider between the stack and the attributes: the stack's max height, as % of the column. The browser
  // remembers it (a per-person convenience; without storage it falls back to 50%).
  const SHARE_KEY = 'svertik:stack-share';
  const MIN = 15;
  const MAX = 85;
  const clamp = (v: number) => Math.round(Math.max(MIN, Math.min(MAX, v)));
  function stored() {
    try {
      const v = Number(localStorage.getItem(SHARE_KEY));
      return v ? clamp(v) : 50;
    } catch {
      return 50;
    }
  }
  let share = $state(stored());
  let dragging = $state(false);
  let column = $state<HTMLElement>();
  function setShare(v: number) {
    share = clamp(v);
    try {
      localStorage.setItem(SHARE_KEY, String(share));
    } catch {
      // No storage: it lasts for this session.
    }
  }
  function startSplit(e: PointerEvent) {
    if (!column || e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    dragging = true;
    const box = column.getBoundingClientRect();
    const move = (ev: PointerEvent) => setShare(((ev.clientY - box.top) / box.height) * 100);
    const up = () => {
      dragging = false;
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
  function splitKey(e: KeyboardEvent) {
    const step = e.shiftKey ? 10 : 5;
    const next = e.key === 'ArrowUp' ? share - step : e.key === 'ArrowDown' ? share + step : e.key === 'Home' ? MIN : e.key === 'End' ? MAX : null;
    if (next === null) return;
    e.preventDefault();
    setShare(next);
  }

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
    <!-- Stack and Layers fold independently; attributes remain visible below the divider. -->
    <div id="inspector-panel-stack" class="panel stack-panel" role="tabpanel" aria-labelledby="inspector-tab-stack" bind:this={column} style:--stack-share="{share}%">
      <StackPanel {editor} />
      {#if editor.stackOpen}
      <!-- Focusable divider (ARIA window splitter pattern): it is interactive. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        class="split"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize stack and attributes"
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={share}
        tabindex="0"
        title="Drag to resize · double-click to reset"
        data-dragging={dragging || undefined}
        onpointerdown={startSplit}
        ondblclick={() => setShare(50)}
        onkeydown={splitKey}
      ></div>
      {/if}
      <section class="properties" aria-label="Properties">
        <div class="properties-body"><Attributes {editor} {onreplace} /></div>
      </section>
      {#if editor.showLayers}<LayersPanel {editor} />{/if}
    </div>
  {:else}
    <div id="inspector-panel-document" class="panel document-panel" role="tabpanel" aria-labelledby="inspector-tab-document">
      {#if editor.scene}
        <DocumentAttributes {editor} />
      {:else if editor.showInfo}
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
  .tabs button[aria-selected='true']::after { content: ''; position: absolute; right: var(--sv-space-8); bottom: -1px; left: var(--sv-space-8); height: 2px; background: var(--sv-accent-fill); }
  .tabs button:focus-visible { outline-offset: -2px; }
  .panel { flex: 1; min-height: 0; overflow-y: auto; }
  .stack-panel { display: flex; flex-direction: column; overflow: hidden; }
  .properties { display: flex; flex-direction: column; flex: 1; min-height: 0; border-top: var(--sv-border-1) solid var(--sv-rule-default); }
  /* The divider already draws the rule between Stack and Properties. */
  .split + .properties { border-top: 0; }
  .properties-body { display: flex; flex: 1; min-height: 0; }
  /* The divider: the usual 1 px rule, with a 7 px grab area. */
  .split {
    position: relative;
    flex: none;
    height: 7px;
    margin: -3px 0;
    z-index: 1;
    cursor: ns-resize;
    touch-action: none;
  }
  .split::before { content: ''; position: absolute; inset: 3px 0; background: var(--sv-rule-default); }
  .split:hover::before { inset: 2px 0; background: var(--sv-rule-strong); }
  .split[data-dragging]::before,
  .split:focus-visible::before { inset: 3px 0; background: var(--sv-accent-fill); }
  .split:focus-visible { outline: none; }
  .document-panel { overflow-y: auto; }
  .empty { padding: var(--sv-space-12); color: var(--sv-text-muted); font-size: var(--sv-font-size-11); line-height: 1.5; }
  .empty p { margin: 0 0 var(--sv-space-4); }
</style>
