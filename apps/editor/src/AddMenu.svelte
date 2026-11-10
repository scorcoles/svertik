<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import { Icon, IconButton, type IconName } from '@svertik/ui';
  import { modifierTypes, registry, type Editor } from './editor.svelte';

  let { editor }: { editor: Editor } = $props();
  // Por tipo; los de una familia (Glitch), juntos en su sección.
  const of = (kind: string) => modifierTypes.filter((t) => registry.get(t)?.kind === kind && !registry.get(t)?.family);
  const groups = $derived([
    ['Deformers', of('deformer')],
    ['Generators', of('generator')],
    ['Glitch', modifierTypes.filter((t) => registry.get(t)?.family === 'glitch')],
    ['Effectors', of('effector')],
    ['Style', of('style')],
    ['Filters', of('filter')],
  ] as const);
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger disabled={!editor.scene}>
    {#snippet child({ props })}
      <IconButton {...props} icon="plus" label="Add modifier" />
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content class="sv-menu" align="end" sideOffset={4} collisionPadding={8}>
      {#each groups as [title, types], i (title)}
        {#if i > 0}<DropdownMenu.Separator class="sv-menu-rule" />{/if}
        <DropdownMenu.Group>
          <DropdownMenu.GroupHeading class="sv-menu-heading">{title}</DropdownMenu.GroupHeading>
          {#each types as type (type)}
            <DropdownMenu.Item class="sv-menu-item" onSelect={() => editor.add(type)}>
              <Icon name={type as IconName} />
              {registry.get(type)?.label}
            </DropdownMenu.Item>
          {/each}
        </DropdownMenu.Group>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  :global(.sv-menu) {
    z-index: 50;
    /* Si no cabe en la pantalla, se desplaza (la altura que queda la da Bits UI). */
    max-height: var(--bits-dropdown-menu-content-available-height, calc(100vh - 16px));
    overflow-y: auto;
    overscroll-behavior: contain;
    width: 220px;
    padding: var(--sv-space-4) 0;
    font-family: var(--sv-font-mono);
    font-size: var(--sv-font-size-11);
    background: var(--sv-surface-raised);
    border: var(--sv-border-1) solid var(--sv-rule-strong);
  }
  :global(.sv-menu-heading) {
    height: 22px;
    padding: 0 var(--sv-space-8);
    display: flex;
    align-items: center;
    font-size: var(--sv-font-size-10);
    color: var(--sv-text-muted);
  }
  :global(.sv-menu-item) {
    display: flex;
    align-items: center;
    gap: var(--sv-space-8);
    height: 24px;
    padding: 0 var(--sv-space-8);
    color: var(--sv-text-primary);
    cursor: pointer;
    outline: none;
  }
  :global(.sv-menu-item .sv-icon) { color: var(--sv-text-secondary); }
  :global(.sv-menu-item[data-highlighted]) { background: var(--sv-surface-hover); }
  :global(.sv-menu-item[data-highlighted] .sv-icon) { color: var(--sv-accent-fill); }
  :global(.sv-menu-rule) { height: 1px; margin: var(--sv-space-4) 0; background: var(--sv-rule-default); }
</style>
