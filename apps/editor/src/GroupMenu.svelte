<script lang="ts">
  import { t } from '@svertik/ui';
  import { autonomousGenerators } from '@svertik/engine';
  import { DropdownMenu } from 'bits-ui';
  import { Icon, type IconName } from '@svertik/ui';
  import { registry, type Editor } from './editor.svelte';

  interface Props {
    editor: Editor;
    label: string;
    icon: IconName;
    types: string[];
    /** Icon only, for the vertical rail: the name goes in the tooltip and the menu opens to the right. */
    compact?: boolean;
  }
  let { editor, label, icon, types, compact = false }: Props = $props();
  // When jumping to the command line, the menu must not return focus to its trigger: the line keeps it.
  let toCommand = false;
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    class="sv-group-trigger{compact ? ' is-compact' : ''}"
    disabled={!editor.scene}
    title={compact ? label : undefined}
    aria-label={compact ? label : undefined}
  >
    <Icon name={icon} />
    {#if !compact}{label} <span class="caret" aria-hidden="true">▾</span>{/if}
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      class="sv-menu sv-effect-menu"
      align="start"
      side={compact ? 'right' : 'bottom'}
      sideOffset={compact ? 6 : 4}
      avoidCollisions={true}
      collisionPadding={8}
      onCloseAutoFocus={(e) => { if (toCommand) { e.preventDefault(); toCommand = false; } }}
    >
      {#each types as type (type)}
        {@const source = autonomousGenerators.find((item) => item.type === type)}
        <DropdownMenu.Item class="sv-menu-item" disabled={!source && !editor.canAdd(type)} title={!source && !editor.canAdd(type) ? t('Not available for raster images') : undefined} onSelect={() => source ? editor.addShape(type) : editor.add(type)}>
          <Icon name={type as IconName} />
          <span class="effect-name">{source?.label ?? registry.get(type)?.label}</span>
        </DropdownMenu.Item>
      {/each}
      <!-- Footer: points to the command line right where people look for an effect. -->
      <DropdownMenu.Separator class="sv-menu-rule" />
      <DropdownMenu.Item class="sv-menu-item search-all" onSelect={() => { toCommand = true; editor.openCommand(); }}>
        <span class="effect-name">{t('Search all effects…')}</span>
        <kbd>/</kbd>
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  /* The trigger (.sv-group-trigger) and the menus are styled in menu.css. */
  :global(.sv-effect-menu) {
    box-sizing: border-box;
    width: 240px;
    max-width: min(240px, calc(100vw - 16px));
    max-height: min(var(--bits-dropdown-menu-content-available-height, calc(100dvh - 16px)), calc(100dvh - 16px));
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  :global(.sv-effect-menu .sv-menu-item) { height: auto; min-height: 24px; padding-block: var(--sv-space-4); }
  :global(.sv-effect-menu .sv-menu-item[data-disabled]) { opacity: 0.38; cursor: default; }
  .effect-name { min-width: 0; overflow-wrap: anywhere; line-height: 1.25; }
  .caret { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  :global(.sv-menu-item.search-all) { color: var(--sv-text-secondary); }
  :global(.sv-menu-item.search-all[data-highlighted]) { color: var(--sv-text-primary); }
  :global(.sv-menu-item.search-all) .effect-name { flex: 1; }
  kbd { font: inherit; color: var(--sv-text-secondary); }
</style>
