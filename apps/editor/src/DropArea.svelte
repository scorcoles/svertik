<script lang="ts">
  import { t } from '@svertik/ui';
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
  <div class="brand" aria-label="svertik_">
    <span>svertik</span><span class="brand-suffix" aria-hidden="true">_</span>
  </div>
  {#if showWelcome}
    <div class="welcome-header">
      <img src="/assets/welcome.png" alt="svertik" />
    </div>
  {/if}
  <div class="drop-content">
    <button class="drop-target" type="button" onclick={onimport} aria-label={t('Choose an SVG or project file')}>
      <span class="icon"><Icon name="import" /></span>
      <strong>{t('Drop an SVG or a project (.json) here')}</strong>
      <span class="muted">{t('or paste it (⌘V), or click to open a file')}</span>
    </button>
    <DemoReel {ondemo} />
    <div class="start">
      <div class="open-document">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}<Button {...props} class="all-demos" kind="primary" label={t('All demos')} iconAfter="down" />{/snippet}
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
        <span class="row-label">{t('New scene')}</span>
        <div class="new-document-controls">
          <label class="dimension">W <input type="number" min="1" max="10000" bind:value={width} aria-label={t('Document width')} /></label>
          <span class="times" aria-hidden="true">×</span>
          <label class="dimension">H <input type="number" min="1" max="10000" bind:value={height} aria-label={t('Document height')} /></label>
          <span class="unit">px</span>
          <Button kind="primary" label={t('Create')} onclick={() => editor.newFile(width, height)} />
        </div>
      </div>
    </div>
    {#if editor.error}<p class="error" role="alert">{editor.error}</p>{/if}
  </div>
</div>

<style>
  .drop {
    display: grid;
    justify-items: center;
    gap: 0;
    width: min(560px, calc(100% - 32px));
    padding: 0 0 var(--sv-space-24);
    color: var(--sv-text-muted);
    text-align: center;
    background: var(--sv-surface-panel);
    border: var(--sv-border-1) solid var(--sv-rule-default);
  }
  .drop.without-welcome { padding-top: var(--sv-space-32); }
  .brand {
    margin-bottom: var(--sv-space-24);
    color: var(--sv-text-primary);
    font-size: 22px;
    font-weight: var(--sv-font-weight-bold);
    line-height: 1;
    letter-spacing: -0.06em;
  }
  .brand-suffix { color: var(--sv-accent-text); }
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
  .drop-target {
    display: grid;
    justify-items: center;
    gap: var(--sv-space-12);
    width: 100%;
    padding: 0;
    color: inherit;
    text-align: center;
    background: transparent;
    border: 0;
    font: inherit;
    cursor: pointer;
  }
  .drop-target:hover .icon, .drop-target:focus-visible .icon { border-color: var(--sv-accent-fill); background: var(--sv-accent-fill); color: var(--sv-accent-on); }
  .drop-target:focus-visible { outline: 1px solid var(--sv-accent-text); outline-offset: 5px; }
  .icon {
    cursor: pointer;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    color: var(--sv-accent-text);
    border: var(--sv-border-1) solid var(--sv-rule-default);
  }
  :global([data-sv-theme='light']) .icon { color: var(--sv-accent-on); }
  strong {
    color: var(--sv-text-primary);
    font-size: var(--sv-font-size-12);
  }
  .start {
    display: grid;
    width: 100%;
    justify-items: center;
    gap: 0;
    margin-top: var(--sv-space-8);
  }
  .open-document { display: flex; justify-content: center; width: 100%; }
  :global(.sv-button.all-demos) { width: 144px; }
  .new-document { display: grid; justify-items: center; gap: var(--sv-space-8); padding: 0; }
  .row-label { margin-right: var(--sv-space-4); color: var(--sv-text-primary); }
  .new-document-controls { display: flex; align-items: center; justify-content: center; gap: var(--sv-space-8); }
  .dimension { display: flex; align-items: center; gap: 5px; color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .dimension input { width: 64px; height: 20px; padding: 0 var(--sv-space-6); color: var(--sv-text-primary); background: var(--sv-surface-field); border: var(--sv-border-1) solid var(--sv-rule-default); font: inherit; font-variant-numeric: tabular-nums; }
  .dimension input:hover { border-color: var(--sv-rule-strong); }
  .dimension input:focus { border-color: var(--sv-accent-fill); outline: none; }
  .times, .unit { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .separator { width: calc(100% + var(--sv-space-24) + var(--sv-space-24)); height: 1px; margin: var(--sv-space-24) 0 var(--sv-space-16); background: var(--sv-rule-default); }
  @media (max-width: 520px) { .new-document-controls { flex-wrap: wrap; } }
  .error {
    margin: 0;
    color: var(--sv-signal-error);
    font-size: var(--sv-font-size-10);
  }
</style>
