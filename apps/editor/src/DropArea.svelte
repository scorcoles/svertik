<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import DemoItems from './DemoItems.svelte';
  import DemoReel from './DemoReel.svelte';
  import { Button, Icon } from '@svertik/ui';
  import { DEFAULT_DOCUMENT, type Editor } from './editor.svelte';
  import type { DemoName } from './demo-catalog';

  interface Props {
    editor: Editor;
    onimport: () => void;
    ondemo: (which: DemoName) => void;
    showWelcome?: boolean;
  }
  let { editor, onimport, ondemo, showWelcome = false }: Props = $props();
  let width = $state(DEFAULT_DOCUMENT.width);
  let height = $state(DEFAULT_DOCUMENT.height);
</script>

<div class="drop" class:without-welcome={!showWelcome}>
  {#if showWelcome}
    <div class="welcome-header">
      <img src="/assets/welcome.png" alt="svertik" />
    </div>
  {/if}
  <div class="drop-content">
    <span class="icon"><Icon name="import" /></span>
    <strong>Drop an SVG or a project (.json) here</strong>
    <span class="muted">or paste it (⌘V), or draw with the tools on the left</span>
    <DemoReel {ondemo} />
    <div class="start">
      <div class="open-document">
        <!-- One primary action: the demos are the quickest way to see what svertik does. -->
        <Button label="Choose file…" onclick={onimport} />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}<Button {...props} kind="primary" label="All demos ▾" />{/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content class="sv-menu sv-demos" side="right" align="start" sideOffset={4} collisionPadding={8}>
              <DemoItems {ondemo} />
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      <span class="separator" aria-hidden="true"></span>
      <div class="new-document">
        <span class="row-label">New scene</span>
        <label class="dimension">W <input type="number" min="1" max="10000" bind:value={width} aria-label="Document width" /></label>
        <span class="times" aria-hidden="true">×</span>
        <label class="dimension">H <input type="number" min="1" max="10000" bind:value={height} aria-label="Document height" /></label>
        <span class="unit">px</span>
        <Button label="Create" onclick={() => editor.newFile(width, height)} />
      </div>
    </div>
    {#if editor.error}<p class="error" role="alert">{editor.error}</p>{/if}
  </div>
</div>

<style>
  .drop {
    display: grid;
    justify-items: center;
    gap: var(--sv-space-12);
    width: min(560px, calc(100% - 32px));
    padding: 0 0 var(--sv-space-24);
    color: var(--sv-text-muted);
    text-align: center;
    background: var(--sv-surface-panel);
    border: var(--sv-border-1) solid var(--sv-rule-default);
  }
  .drop.without-welcome { padding-top: var(--sv-space-32); }
  .welcome-header {
    width: 100%;
    line-height: 0;
  }
  .welcome-header img {
    display: block;
    width: 100%;
    height: auto;
  }
  .drop-content {
    display: grid;
    justify-items: center;
    gap: var(--sv-space-12);
    width: 100%;
    box-sizing: border-box;
    padding: 0 var(--sv-space-24, 24px);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    color: var(--sv-accent-fill);
    border: var(--sv-border-1) solid var(--sv-rule-default);
  }
  strong {
    color: var(--sv-text-primary);
    font-size: var(--sv-font-size-12);
  }
  .start {
    display: grid;
    width: 100%;
    justify-items: center;
    gap: 0;
    margin-top: var(--sv-space-4);
  }
  .open-document { display: flex; justify-content: center; gap: var(--sv-space-8); }
  .new-document { display: flex; align-items: center; gap: var(--sv-space-8); padding: var(--sv-space-4) 0; }
  .row-label { margin-right: var(--sv-space-4); color: var(--sv-text-primary); }
  .dimension { display: flex; align-items: center; gap: 5px; color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .dimension input { width: 64px; height: 20px; padding: 0 var(--sv-space-6); color: var(--sv-text-primary); background: var(--sv-surface-field); border: var(--sv-border-1) solid var(--sv-rule-default); font: inherit; font-variant-numeric: tabular-nums; }
  .dimension input:hover { border-color: var(--sv-rule-strong); }
  .dimension input:focus { border-color: var(--sv-accent-fill); outline: none; }
  .times, .unit { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .separator { width: calc(100% + var(--sv-space-24) + var(--sv-space-24)); height: 1px; margin: var(--sv-space-24) 0 var(--sv-space-16); background: var(--sv-rule-default); }
  @media (max-width: 520px) { .new-document { flex-wrap: wrap; justify-content: center; } .row-label { flex-basis: 100%; } }
  .error {
    margin: 0;
    color: var(--sv-signal-error);
    font-size: var(--sv-font-size-10);
  }
</style>
