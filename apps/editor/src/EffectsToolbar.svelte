<script lang="ts">
  import { autonomousGenerators } from '@svertik/engine';
  import { modifierTypes, registry, type Editor } from './editor.svelte';
  import GroupMenu from './GroupMenu.svelte';
  import { categoryOf } from './command';
  import UtilsMenu from './UtilsMenu.svelte';

  let { editor }: { editor: Editor } = $props();
  // Each effect under its menu (menuOf: what it is for). Rigid Body right after Physics: the two go together.
  const of = (menu: string) => modifierTypes.filter((type) => { const d = registry.get(type); return !!d && categoryOf(d) === menu; });
  const motion = of('Motion').filter((type) => type !== 'rigidbody');
  motion.splice(motion.indexOf('physics') + 1, 0, ...(registry.get('rigidbody') ? ['rigidbody'] : []));
  const groups = [
    { label: 'Deform', icon: 'spherize', types: of('Deform') },
    { label: 'Repeat', icon: 'clone', types: of('Repeat') },
    { label: 'Draw', icon: 'halftone', types: [...of('Draw'), ...autonomousGenerators.map((source) => source.type)] },
    { label: 'Effect', icon: 'step', types: of('Effect') },
    { label: 'Motion', icon: 'gravity', types: motion },
    { label: 'Style', icon: 'color', types: of('Style') },
    { label: 'Glitch', icon: 'glitch', types: of('Glitch') },
    { label: 'Filters', icon: 'shadow', types: of('Filters') },
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
