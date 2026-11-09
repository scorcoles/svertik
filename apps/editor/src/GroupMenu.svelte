<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import { Icon, type IconName } from '@svertik/ui';
  import { registry, type Editor } from './editor.svelte';

  interface Props {
    editor: Editor;
    label: string;
    icon: IconName;
    types: string[];
  }
  let { editor, label, icon, types }: Props = $props();
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger class="sv-group-trigger" disabled={!editor.scene}>
    <Icon name={icon} />
    {label}
    <span class="caret" aria-hidden="true">▾</span>
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content class="sv-menu" align="start" sideOffset={4}>
      {#each types as type (type)}
        <DropdownMenu.Item class="sv-menu-item" onSelect={() => editor.add(type)}>
          <Icon name={type as IconName} />
          {registry.get(type)?.label}
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  :global(.sv-group-trigger) {
    display: flex;
    align-items: center;
    gap: var(--sv-space-6);
    height: 24px;
    padding: 0 var(--sv-space-6);
    font: inherit;
    color: var(--sv-text-primary);
    background: none;
    border: 0;
    cursor: pointer;
  }
  :global(.sv-group-trigger .sv-icon) { color: var(--sv-text-secondary); }
  :global(.sv-group-trigger:hover) { background: var(--sv-surface-hover); }
  :global(.sv-group-trigger[data-state='open']) { background: var(--sv-accent-selection); color: var(--sv-accent-fill); }
  :global(.sv-group-trigger[data-state='open'] .sv-icon) { color: var(--sv-accent-fill); }
  :global(.sv-group-trigger:disabled) { opacity: 0.35; cursor: default; background: none; }
  .caret { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
</style>
