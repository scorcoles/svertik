<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import { Icon } from '@svertik/ui';
  import type { Editor } from './editor.svelte';

  // Utilidades que crean objetos que trabajan con otros (instancias…). Lo que necesita un objeto de
  // partida se apaga sin selección.
  let { editor }: { editor: Editor } = $props();
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
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  .caret { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
</style>
