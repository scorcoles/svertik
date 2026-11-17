<script lang="ts">
  import { IconButton, Select, StackItem } from '@svertik/ui';
  import type { Editor } from './editor.svelte';
  import PanelHeader from './PanelHeader.svelte';

  let { editor }: { editor: Editor } = $props();

  // Layers split the scene's objects: the stack below shows only the active one. Without layers, the
  // scene is a single implicit layer ("Layer 1"); adding one turns the current objects into it.
  const layers = $derived(editor.layers);
  const active = $derived(editor.activeLayer);
  const index = $derived(active ? layers.indexOf(active) : -1);
  // "Move to": the other layers, for the selected objects.
  const others = $derived(active ? layers.filter((l) => l.id !== active.id && !l.locked) : []);
  const MOVE = 'Move to…';
  // The menu is an action, not a setting: it shows "Move to…" again after each move.
  let moves = $state(0);
</script>

<section class="layers" aria-label="Layers">
  <PanelHeader title="Layers" open={editor.layersOpen} ontoggle={(v) => (editor.layersOpen = v)} controls="layer-rows" detail={editor.layersOpen ? undefined : active?.name ?? 'Layer 1'}>
    {#if editor.layersOpen && editor.selectedNodes.length && others.length}
      <div class="move">
        {#key moves}
          <Select value={MOVE} options={[MOVE, ...others.map((l) => l.name)]} label="Move the selection to another layer" onchange={(name) => {
            const target = others.find((l) => l.name === name);
            if (target) editor.moveSelectionToLayer(target.id);
            moves++;
          }} />
        {/key}
      </div>
    {/if}
    <IconButton icon="up" label="Move layer to the front" disabled={index <= 0} onclick={() => active && editor.moveLayer(active.id, -1)} />
    <IconButton icon="down" label="Move layer to the back" disabled={index < 0 || index >= layers.length - 1} onclick={() => active && editor.moveLayer(active.id, 1)} />
    <IconButton icon="plus" label="New layer" disabled={!editor.scene} onclick={() => editor.addLayer()} />
    <IconButton icon="close" label="Close the Layers panel (View menu opens it again)" onclick={() => (editor.showLayers = false)} />
  </PanelHeader>
  {#if editor.scene && editor.layersOpen}
    <div id="layer-rows" class="rows" role="tree" aria-label="Layers">
      {#if layers.length}
        {#each layers as l (l.id)}
          <StackItem
            label={l.name}
            kind="object"
            icon="layer"
            selected={l.id === active?.id}
            onselect={() => editor.setActiveLayer(l.id)}
            visible={l.visible !== false}
            onvisible={(v) => editor.setLayerVisible(l.id, v)}
            locked={!!l.locked}
            onlock={() => editor.toggleLock(l.id)}
            onrename={l.locked ? undefined : (name) => editor.renameLayer(l.id, name)}
            onremove={l.locked || layers.length <= 1 ? undefined : () => editor.removeLayer(l.id)}
            tabbable={l.id === active?.id}
          />
        {/each}
      {:else}
        <!-- The implicit layer: every object of the scene. -->
        <StackItem label="Layer 1" kind="object" icon="layer" selected tabbable onselect={() => {}} />
      {/if}
    </div>
  {/if}
</section>

<style>
  /* At the bottom of the inspector column, under the properties. */
  .layers { display: flex; flex-direction: column; flex: none; margin-top: auto; border-top: var(--sv-border-1) solid var(--sv-rule-default); }
  .move { width: 104px; }
  /* About four rows; more scroll. */
  .rows { max-height: calc(var(--sv-size-row) * 4); overflow-y: auto; padding-bottom: var(--sv-space-4); }
</style>
