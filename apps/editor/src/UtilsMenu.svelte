<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import { Icon, type IconName } from '@svertik/ui';
  import { modifierTypes, registry, type Editor } from './editor.svelte';

  // Utilidades que crean objetos que trabajan con otros (instancias…). Lo que necesita un objeto de
  // partida se apaga sin selección.
  let { editor }: { editor: Editor } = $props();
  // Efectos de la familia Utils (Follow Path…): van a la pila del objeto seleccionado.
  const effects = modifierTypes.filter((t) => registry.get(t)?.family === 'utils' && t !== 'connect' && t !== 'trace'); // Connect y Trace: con Connector y Tracer
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger class="sv-group-trigger" disabled={!editor.scene}>
    <Icon name="instance" />
    Utils
    <span class="caret" aria-hidden="true">▾</span>
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content class="sv-menu" align="start" sideOffset={4}>
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
      {#if effects.length}<DropdownMenu.Separator class="sv-menu-rule" />{/if}
      {#each effects as type (type)}
        <DropdownMenu.Item class="sv-menu-item" disabled={!editor.activeNode} onSelect={() => editor.add(type)}>
          <Icon name={type as IconName} />
          {registry.get(type)?.label}
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  .caret { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
</style>
