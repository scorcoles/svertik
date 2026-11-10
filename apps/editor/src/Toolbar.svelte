<script lang="ts">
  import { Button, IconButton } from '@svertik/ui';
  import { modifierTypes, registry, type Editor } from './editor.svelte';
  import AppMenu from './AppMenu.svelte';
  import GroupMenu from './GroupMenu.svelte';

  interface Props {
    editor: Editor;
    onimport: () => void;
    onsave: () => void;
    oncopyjson: () => void;
    oncopycode: () => void;
    onexport: () => void;
    onexportpng: () => void;
    ondemo: (which: 'intro' | 'shatter') => void;
    onnew: () => void;
  }
  let { editor, onimport, onsave, oncopyjson, oncopycode, onexport, onexportpng, ondemo, onnew }: Props = $props();
  const of = (kind: string) => modifierTypes.filter((t) => registry.get(t)?.kind === kind);
  // Los efectos, por grupos: la barra no crece aunque crezca el catálogo.
  const groups = [
    { label: 'Deform', icon: 'spherize', types: of('deformer') },
    { label: 'Generate', icon: 'clone', types: of('generator') },
    { label: 'Effect', icon: 'step', types: of('effector') },
    { label: 'Style', icon: 'color', types: of('style') },
  ] as const;
</script>

<header class="toolbar">
  <div class="doc">
    <AppMenu {editor} {onnew} onopen={onimport} {onsave} onexportsvg={onexport} {onexportpng} {oncopyjson} {ondemo} />
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
      {#if editor.objectCount > 1}<span class="slash">·</span><span class="count">{editor.objectCount} objects</span>{/if}
    {/if}
  </div>
  <span class="rule" aria-hidden="true"></span>
  <IconButton icon="import" label="Open project or import SVG (⌘O)" onclick={onimport} />
  <IconButton icon="save" label="Save project (⌘S)" disabled={!editor.scene} onclick={onsave} />
  <IconButton icon="undo" label="Undo (⌘Z)" disabled={!editor.canUndo} onclick={() => editor.undo()} />
  <IconButton icon="redo" label="Redo (⇧⌘Z)" disabled={!editor.canRedo} onclick={() => editor.redo()} />
  <span class="rule" aria-hidden="true"></span>
  <div class="effects" role="group" aria-label="Add modifier">
    {#each groups as g (g.label)}
      <GroupMenu {editor} label={g.label} icon={g.icon} types={[...g.types]} />
    {/each}
  </div>
  <span class="spacer"></span>
  <Button label="Copy JSON" disabled={!editor.scene} onclick={oncopyjson} />
  <Button label="Code" disabled={!editor.scene} aria-pressed={editor.codeOpen} onclick={oncopycode} />
  <Button label="Export PNG" disabled={!editor.scene} onclick={onexportpng} />
  <Button label="Export SVG" kind="primary" disabled={!editor.scene} onclick={onexport} />
</header>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--sv-space-4);
    height: 40px;
    padding: 0 var(--sv-space-8);
    background: var(--sv-surface-panel);
    border-bottom: var(--sv-border-1) solid var(--sv-rule-default);
    min-width: 0;
  }
  .doc { display: flex; align-items: baseline; gap: var(--sv-space-6); padding: 0 var(--sv-space-4); min-width: 0; }
  .alpha {
    align-self: center;
    padding: 1px 4px;
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--sv-surface-app);
    background: var(--sv-accent-fill);
  }
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
  .effects { display: flex; gap: var(--sv-space-4); }
  .spacer { flex: 1; }
</style>
