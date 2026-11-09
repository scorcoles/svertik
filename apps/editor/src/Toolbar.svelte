<script lang="ts">
  import { Button, IconButton, type IconName } from '@svertik/ui';
  import { modifierTypes, registry, type Editor } from './editor.svelte';

  interface Props {
    editor: Editor;
    onimport: () => void;
    oncopyjson: () => void;
    oncopycode: () => void;
    onexport: () => void;
  }
  let { editor, onimport, oncopyjson, oncopycode, onexport }: Props = $props();
  const off = $derived(!editor.scene);
</script>

<header class="toolbar">
  <div class="doc">
    <strong>svertik</strong>
    {#if editor.scene}<span class="slash">/</span><span class="name" title={editor.name}>{editor.name}</span>{/if}
  </div>
  <span class="rule" aria-hidden="true"></span>
  <IconButton icon="import" label="Import SVG (⌘O)" onclick={onimport} />
  <IconButton icon="undo" label="Undo (⌘Z)" disabled={!editor.canUndo} onclick={() => editor.undo()} />
  <IconButton icon="redo" label="Redo (⇧⌘Z)" disabled={!editor.canRedo} onclick={() => editor.redo()} />
  <span class="rule" aria-hidden="true"></span>
  <span class="add" class:off>Add</span>
  <div class="effects" role="group" aria-label="Add modifier">
    {#each modifierTypes as type (type)}
      <IconButton icon={type as IconName} label={`Add ${registry.get(type)?.label}`} disabled={off} onclick={() => editor.add(type)} />
    {/each}
  </div>
  <span class="spacer"></span>
  <Button label="Copy JSON" disabled={off} onclick={oncopyjson} />
  <Button label="Code" disabled={off} aria-pressed={editor.codeOpen} onclick={oncopycode} />
  <Button label="Export SVG" kind="primary" disabled={off} onclick={onexport} />
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
  .doc strong { font-size: var(--sv-font-size-12); }
  .slash { color: var(--sv-text-disabled); }
  .name { color: var(--sv-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px; }
  .rule { flex: none; width: 1px; height: 20px; margin: 0 var(--sv-space-6); background: var(--sv-rule-default); }
  .add { margin-right: var(--sv-space-2); color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .add.off { opacity: 0.35; }
  .effects { display: flex; gap: var(--sv-space-4); }
  .spacer { flex: 1; }
</style>
