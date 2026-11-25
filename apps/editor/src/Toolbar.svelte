<script lang="ts">
  import { t } from '@svertik/ui';
  import { tick } from 'svelte';
  import { Icon, IconButton } from '@svertik/ui';
  import type { Editor } from './editor.svelte';
  import type { DemoName } from './demo-catalog';
  import AppMenu from './AppMenu.svelte';
  import ExportMenu from './ExportMenu.svelte';
  import EffectsToolbar from './EffectsToolbar.svelte';
  import CommandLine from './CommandLine.svelte';

  interface Props {
    editor: Editor;
    onimport: () => void;
    onsave: () => void;
    /** Only where the browser can pick files (Chrome, Edge). */
    onsaveas?: () => void;
    oncopyjson: () => void;
    /** Copies (or, on touch screens, shares) a link that opens the scene in Play. */
    onshare: () => void;
    /** Starts the editor tour (opening a demo first when nothing is open). */
    ontour: () => void;
    onexport: () => void;
    onexportpng: () => void;
    onexportmp4: () => void;
    onexportlottie: () => void;
    onexportanimsvg: () => void;
    ondemo: (which: DemoName) => void;
    onnew: () => void;
  }
  let { editor, onimport, onsave, onsaveas, oncopyjson, onshare, ontour, onexport, onexportpng, onexportmp4, onexportlottie, onexportanimsvg, ondemo, onnew }: Props = $props();
  let fullscreen = $state(false);
  let renaming = $state(false);
  let draftName = $state('');
  let nameInput = $state<HTMLInputElement>();
  let nameButton = $state<HTMLButtonElement>();
  async function openRename() {
    draftName = editor.name;
    renaming = true;
    await tick();
    nameInput?.focus();
    nameInput?.select();
  }
  function closeRename(save: boolean) {
    if (save) editor.setName(draftName);
    renaming = false;
    nameButton?.focus();
  }
  const toggleFullscreen = () => fullscreen ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.();
</script>

<svelte:window onfullscreenchange={() => (fullscreen = !!document.fullscreenElement)} />

<div class="toolbar-area">
<header class="toolbar" class:command-in-slot={editor.commandInEffectsSlot}>
  <div class="doc">
    <AppMenu {editor} {onnew} onopen={onimport} {onsave} {onsaveas} {onshare} {ontour} {ondemo} />
    {#if editor.scene}
      <span class="slash">/</span>
      <button
        bind:this={nameButton}
        class="name"
        type="button"
        title={editor.name}
        aria-label={t('Rename scene: {name}', { name: editor.name })}
        aria-expanded={renaming}
        aria-controls="scene-name-strip"
        onclick={openRename}
      >{editor.name}</button>
      {#if editor.compositionPath.length}
        <button class="crumb" type="button" onclick={() => editor.leaveComposition(0)} title={t('Return to the main scene')}>{t('Main scene')}</button>
        {#each editor.compositionBreadcrumbs as crumb, i}
          <span class="slash">/</span>
          <button class="crumb" type="button" onclick={() => editor.leaveComposition(i + 1)} aria-current={i === editor.compositionPath.length - 1 ? 'location' : undefined} title={crumb.name}>{crumb.name}</button>
        {/each}
      {/if}
    {/if}
  </div>
  <span class="rule" aria-hidden="true"></span>
  <IconButton icon="import" label={t('Open project or import SVG (⌘O)')} onclick={onimport} />
  <IconButton icon="save" label={t('Save project (⌘S)')} disabled={!editor.scene} onclick={onsave} />
  <IconButton icon="undo" label={t('Undo (⌘Z)')} disabled={!editor.canUndo} onclick={() => editor.undo()} />
  <IconButton icon="redo" label={t('Redo (⇧⌘Z)')} disabled={!editor.canRedo} onclick={() => editor.redo()} />
  {#if editor.commandInEffectsSlot}
    <CommandLine {editor} compact />
  {:else if editor.scene}
    <EffectsToolbar {editor} />
  {/if}
  <span class="spacer"></span>
  <IconButton icon={fullscreen ? 'restore' : 'maximize'} label={fullscreen ? t('Exit full screen') : t('Enter full screen')} onclick={toggleFullscreen} />
  <button class="play-button" type="button" disabled={!editor.scene} onclick={() => { editor.playing = false; editor.presenting = true; }} title={t('Play full screen (Esc to exit)')}>
    <Icon name="play" /> {t('Play')}
  </button>
  <ExportMenu
    {editor}
    disabled={!editor.scene}
    onexportsvg={onexport}
    {onexportpng}
    {onexportmp4}
    {onexportanimsvg}
    {onexportlottie}
    {oncopyjson}
    {onshare}
  />
</header>
{#if renaming && editor.scene}
  <form id="scene-name-strip" class="rename-strip" onsubmit={(event) => { event.preventDefault(); closeRename(true); }}>
    <label for="scene-name-input">{t('Scene title')}</label>
    <input id="scene-name-input" bind:this={nameInput} bind:value={draftName} spellcheck="false" onkeydown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRename(false); }
    }} />
    <button type="submit">{t('Save')}</button>
    <button type="button" onclick={() => closeRename(false)}>{t('Cancel')}</button>
  </form>
{/if}

</div>

<style>
  .toolbar-area { min-width: 0; }
  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--sv-space-4);
    min-height: 40px;
    height: auto;
    flex-wrap: wrap;
    padding: var(--sv-space-4) var(--sv-space-8);
    background: var(--sv-surface-panel);
    border-bottom: var(--sv-border-1) solid var(--sv-rule-default);
    min-width: 0;
  }
  /* Truncate the title first, but reserve room for the fixed controls and
     breadcrumbs' minimum widths so they never spill into the next toolbar item.
     The outer toolbar wraps when this whole group no longer fits. */
  .doc { display: flex; flex: 1000 1 12rem; max-width: max-content; align-items: baseline; gap: var(--sv-space-6); padding: 0 var(--sv-space-4); min-width: min-content; }
  .doc > :global(*) { flex: none; }
  .doc > .name { flex: 0 1 auto; min-width: 4ch; }
  .doc > .crumb { flex: 0 3 auto; min-width: 2ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .doc > .crumb[aria-current] { flex-shrink: 1; min-width: 4ch; }
  .crumb { padding: 0; font: inherit; color: var(--sv-accent-text); background: none; border: 0; cursor: pointer; }
  .crumb:hover { text-decoration: underline; }
  .crumb[aria-current] { color: var(--sv-text-primary); cursor: default; }
  .slash { color: var(--sv-text-muted); }
  .name {
    max-width: 240px;
    padding: 0;
    font: inherit;
    color: var(--sv-text-secondary);
    background: none;
    border: 0;
    border-bottom: 1px solid transparent;
    cursor: pointer;
    text-align: left;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .name:hover { color: var(--sv-text-primary); border-bottom-color: var(--sv-rule-strong); }
  .name:focus { color: var(--sv-text-primary); border-bottom-color: var(--sv-accent-text); }
  .rename-strip {
    display: flex;
    align-items: center;
    gap: var(--sv-space-8);
    padding: var(--sv-space-8);
    background: var(--sv-surface-panel);
    color: var(--sv-text-secondary);
    font: inherit;
  }
  .rename-strip label { white-space: nowrap; }
  .rename-strip input {
    flex: 1;
    min-width: 0;
    height: var(--sv-size-row);
    padding: 0 var(--sv-space-6);
    font: inherit;
    color: var(--sv-text-primary);
    background: var(--sv-surface-panel);
    border: var(--sv-border-1) solid var(--sv-rule-strong);
  }
  .rename-strip button {
    height: var(--sv-size-row);
    padding: 0 var(--sv-space-8);
    font: inherit;
    color: var(--sv-text-primary);
    background: none;
    border: var(--sv-border-1) solid var(--sv-rule-strong);
    border-radius: 0;
    cursor: pointer;
  }
  .rename-strip button:hover { border-color: var(--sv-accent-text); }
  .name:focus-visible, .rename-strip :focus-visible { outline: 1px solid var(--sv-accent-text); outline-offset: 1px; }
  .rule { flex: none; width: 1px; height: 20px; margin: 0 var(--sv-space-6); background: var(--sv-rule-default); }
  .spacer { flex: 1; }
  .toolbar.command-in-slot .spacer { flex: 0 1 0; }
  .play-button {
    display: flex;
    align-items: center;
    gap: var(--sv-space-6);
    height: var(--sv-size-row);
    margin-right: var(--sv-space-8);
    padding: 0 var(--sv-space-12);
    font: inherit;
    color: var(--sv-text-secondary);
    background: none;
    border: var(--sv-border-1) solid var(--sv-rule-strong);
    cursor: pointer;
  }
  .play-button:hover { color: var(--sv-text-primary); border-color: var(--sv-text-muted); }
  .play-button:disabled { opacity: 0.4; cursor: default; }
  .play-button :global(svg) { width: 12px; height: 12px; }
</style>
