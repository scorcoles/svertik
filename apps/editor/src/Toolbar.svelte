<script lang="ts">
  import { Icon, IconButton } from '@svertik/ui';
  import type { Editor } from './editor.svelte';
  import type { DemoName } from './demo-catalog';
  import AppMenu from './AppMenu.svelte';
  import ExportMenu from './ExportMenu.svelte';
  import EffectsToolbar from './EffectsToolbar.svelte';

  interface Props {
    editor: Editor;
    onimport: () => void;
    onsave: () => void;
    oncopyjson: () => void;
    onexport: () => void;
    onexportpng: () => void;
    onexportlottie: () => void;
    onexportanimsvg: () => void;
    ondemo: (which: DemoName) => void;
    onnew: () => void;
  }
  let { editor, onimport, onsave, oncopyjson, onexport, onexportpng, onexportlottie, onexportanimsvg, ondemo, onnew }: Props = $props();
  let fullscreen = $state(false);
  const toggleFullscreen = () => fullscreen ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.();
</script>

<svelte:window onfullscreenchange={() => (fullscreen = !!document.fullscreenElement)} />

<header class="toolbar">
  <div class="doc">
    <AppMenu {editor} {onnew} onopen={onimport} {onsave} onexportsvg={onexport} {onexportpng} {onexportlottie} {onexportanimsvg} {oncopyjson} {ondemo} />
    <span class="alpha" title="Alpha: things change and may break. Save your work as a .svrtk project.">alpha</span>
    {#if editor.scene}
      <span class="slash">/</span>
      <input
        class="name"
        value={editor.name}
        aria-label="Document name"
        title="Rename document"
        spellcheck="false"
        size={Math.max(4, editor.name.length)}
        onchange={(e) => { editor.setName(e.currentTarget.value); e.currentTarget.value = editor.name; }}
        onkeydown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') { e.currentTarget.value = editor.name; e.currentTarget.blur(); }
        }}
      />
      {#if editor.compositionPath.length}
        <button class="crumb" type="button" onclick={() => editor.leaveComposition(0)} title="Return to the main scene">Main scene</button>
        {#each editor.compositionBreadcrumbs as crumb, i}
          <span class="slash">/</span>
          <button class="crumb" type="button" onclick={() => editor.leaveComposition(i + 1)} aria-current={i === editor.compositionPath.length - 1 ? 'location' : undefined}>{crumb.name}</button>
        {/each}
      {/if}
      {#if editor.objectCount > 1}<span class="slash">·</span><span class="count">{editor.objectCount} objects</span>{/if}
    {/if}
  </div>
  <span class="rule" aria-hidden="true"></span>
  <IconButton icon="import" label="Open project or import SVG (⌘O)" onclick={onimport} />
  <IconButton icon="save" label="Save project (⌘S)" disabled={!editor.scene} onclick={onsave} />
  <IconButton icon="undo" label="Undo (⌘Z)" disabled={!editor.canUndo} onclick={() => editor.undo()} />
  <IconButton icon="redo" label="Redo (⇧⌘Z)" disabled={!editor.canRedo} onclick={() => editor.redo()} />
  {#if editor.scene}<EffectsToolbar {editor} />{/if}
  <span class="spacer"></span>
  <IconButton icon={fullscreen ? 'restore' : 'maximize'} label={fullscreen ? 'Exit full screen' : 'Enter full screen'} onclick={toggleFullscreen} />
  <button class="play-button" type="button" disabled={!editor.scene} onclick={() => { editor.playing = false; editor.presenting = true; }} title="Play full screen (Esc to exit)">
    <Icon name="play" /> Play
  </button>
  <ExportMenu
    disabled={!editor.scene}
    onexportsvg={onexport}
    {onexportpng}
    {onexportanimsvg}
    {onexportlottie}
    {oncopyjson}
  />
</header>

<style>
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
  .doc { display: flex; align-items: baseline; gap: var(--sv-space-6); padding: 0 var(--sv-space-4); min-width: 0; }
  /* Insignia discreta: el acento se reserva para lo que se puede pulsar. */
  .alpha {
    align-self: center;
    padding: 0 4px;
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--sv-text-muted);
    background: none;
    border: var(--sv-border-1) solid var(--sv-rule-default);
  }
  .crumb { padding: 0; font: inherit; color: var(--sv-accent-fill); background: none; border: 0; cursor: pointer; }
  .crumb:hover { text-decoration: underline; }
  .crumb[aria-current] { color: var(--sv-text-primary); cursor: default; }
  .slash { color: var(--sv-text-disabled); }
  .name {
    max-width: 240px;
    padding: 0;
    font: inherit;
    color: var(--sv-text-secondary);
    background: none;
    border: 0;
    border-bottom: 1px solid transparent;
    outline: none;
    text-overflow: ellipsis;
  }
  .name:hover { color: var(--sv-text-primary); border-bottom-color: var(--sv-rule-strong); }
  .name:focus { color: var(--sv-text-primary); border-bottom-color: var(--sv-accent-fill); }
  .count { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); white-space: nowrap; }
  .rule { flex: none; width: 1px; height: 20px; margin: 0 var(--sv-space-6); background: var(--sv-rule-default); }
  .spacer { flex: 1; }
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
