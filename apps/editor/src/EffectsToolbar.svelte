<script lang="ts">
  import { autonomousGenerators } from '@svertik/engine';
  import { modifierTypes, registry, type Editor } from './editor.svelte';
  import GroupMenu from './GroupMenu.svelte';
  import UtilsMenu from './UtilsMenu.svelte';

  let { editor }: { editor: Editor } = $props();
  const of = (kind: string) => modifierTypes.filter((type) => registry.get(type)?.kind === kind && !registry.get(type)?.family);
  const glitch = modifierTypes.filter((type) => registry.get(type)?.family === 'glitch');
  const groups = [
    { label: 'Deform', icon: 'spherize', types: of('deformer') },
    { label: 'Generate', icon: 'clone', types: [...of('generator'), ...autonomousGenerators.map((source) => source.type)] },
    { label: 'Effect', icon: 'step', types: of('effector') },
    { label: 'Style', icon: 'color', types: of('style') },
    { label: 'Glitch', icon: 'glitch', types: glitch },
    { label: 'Filters', icon: 'shadow', types: of('filter') },
  ] as const;
</script>

<nav class="effects" aria-label="Effects">
  <!-- All effect menus, including Utils, can be hidden from View; the command line has every effect. -->
  {#if editor.showEffectMenus}
    {#each groups as group (group.label)}
      <GroupMenu {editor} label={group.label} icon={group.icon} types={[...group.types]} />
    {/each}
    <UtilsMenu {editor} />
  {/if}
</nav>

<style>
  .effects { display: flex; flex: 1 1 auto; flex-wrap: wrap; align-items: center; gap: var(--sv-space-4) var(--sv-space-8); min-width: 0; overflow: visible; white-space: nowrap; }
  .effects :global(.sv-group-trigger) { flex: none; }
</style>
