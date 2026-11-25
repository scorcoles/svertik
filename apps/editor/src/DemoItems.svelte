<script lang="ts">
  import { t } from '@svertik/ui';
  import { DropdownMenu } from 'bits-ui';
  import { Icon } from '@svertik/ui';
  import { DEMOS, type DemoName } from './demo-catalog';

  let { ondemo }: { ondemo: (which: DemoName) => void } = $props();
</script>

{#each DEMOS as demo (demo.which)}
  <DropdownMenu.Item class="sv-menu-item" onSelect={() => ondemo(demo.which)}>
    <Icon name="play" />
    <span class="label"><strong>{demo.title}</strong><span class="description">{t(demo.description)}</span></span>
  </DropdownMenu.Item>
{/each}

<style>
  .label { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
  .label strong { font-weight: var(--sv-font-weight-bold); }
  .description { color: var(--sv-text-secondary); font-size: var(--sv-font-size-10); line-height: 1.35; }
  :global(.sv-menu.sv-demos) { width: 280px; }
  :global(.sv-demos .sv-menu-item) { height: auto; min-height: 34px; align-items: flex-start; padding-block: 6px; line-height: 16px; }
  :global(.sv-demos .sv-menu-item > .sv-icon) { margin-top: 1px; }
</style>
