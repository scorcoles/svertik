<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import { Icon, type IconName } from '@svertik/ui';
  import { modifierTypes, registry, type Editor } from './editor.svelte';

  // Utilidades que crean objetos que trabajan con otros (instancias…). Lo que necesita un objeto de
  // partida se apaga sin selección.
  let { editor, compact = false }: { editor: Editor; compact?: boolean } = $props();
  let compositionFile: HTMLInputElement;
  // Efectos de la familia Utils (Follow Path…): van a la pila del objeto seleccionado.
  const effects = modifierTypes.filter((t) => registry.get(t)?.family === 'utils' && t !== 'connect' && t !== 'trace'); // Connect y Trace: con Connector y Tracer
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    class="sv-group-trigger{compact ? ' is-compact' : ''}"
    disabled={!editor.scene}
    title={compact ? 'Utils' : undefined}
    aria-label={compact ? 'Utils' : undefined}
  >
    <Icon name="instance" />
    {#if !compact}Utils <span class="caret" aria-hidden="true">▾</span>{/if}
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      class="sv-menu"
      align="start"
      side={compact ? 'right' : 'bottom'}
      sideOffset={compact ? 6 : 4}
    >
      <DropdownMenu.Item class="sv-menu-item" onSelect={() => editor.createComposition()}>
        <Icon name="composition" /> Empty composition
      </DropdownMenu.Item>
      <DropdownMenu.Item class="sv-menu-item" disabled={!editor.selectedNodes.length} onSelect={() => editor.createComposition(true)}>
        <Icon name="composition" /> Composition from selection
      </DropdownMenu.Item>
      <DropdownMenu.Item class="sv-menu-item" onSelect={() => compositionFile.click()}>
        <Icon name="import" /> Import composition…
      </DropdownMenu.Item>
      <DropdownMenu.Separator class="sv-menu-rule" />
      <DropdownMenu.Item
        class="sv-menu-item"
        disabled={!editor.activeNode}
        title="A live copy of the selected object: change the original and the copy follows"
        onSelect={() => editor.addInstance()}
      >
        <Icon name="instance" />
        Instance
      </DropdownMenu.Item>
      <DropdownMenu.Item
        class="sv-menu-item"
        title="Effects that apply to other objects (its targets), each on its own. Selected objects become its targets."
        onSelect={() => editor.addEffector()}
      >
        <Icon name="effector" />
        Effector
      </DropdownMenu.Item>
      <DropdownMenu.Item
        class="sv-menu-item"
        title="A line that joins two objects and follows them. Select the two objects first."
        onSelect={() => editor.addConnector()}
      >
        <Icon name="connector" />
        Connector
      </DropdownMenu.Item>
      <DropdownMenu.Item
        class="sv-menu-item"
        disabled={!editor.activeNode}
        title="A line that draws the path the selected object leaves behind while it moves (play the animation)"
        onSelect={() => editor.addTracer()}
      >
        <Icon name="tracer" />
        Tracer
      </DropdownMenu.Item>
      {#each effects as type (type)}
        <DropdownMenu.Item class="sv-menu-item" disabled={!editor.activeNode || !editor.canAdd(type)} title={!editor.canAdd(type) ? 'Not available for raster images' : undefined} onSelect={() => editor.add(type)}>
          <Icon name={type as IconName} />
          {registry.get(type)?.label}
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<input bind:this={compositionFile} type="file" accept=".svrtk,.json,application/json" hidden onchange={async (e) => {
  const file = e.currentTarget.files?.[0];
  if (file) editor.importComposition(await file.text(), file.name);
  e.currentTarget.value = '';
}} />

<style>
  :global(.sv-group-trigger.is-compact) {
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
  }
  .caret { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
</style>
