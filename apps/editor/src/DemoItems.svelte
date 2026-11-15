<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import { Icon } from '@svertik/ui';
  import { DEMOS, type DemoName } from './demo-catalog';

  let { ondemo }: { ondemo: (which: DemoName) => void } = $props();
</script>

{#each DEMOS as demo (demo.which)}
  <DropdownMenu.Item class="sv-menu-item" onSelect={() => ondemo(demo.which)}>
    <Icon name="play" />
    <span class="label">{demo.label}</span>
  </DropdownMenu.Item>
{/each}

<style>
  .label { flex: 1; min-width: 0; }
  :global(.sv-menu.sv-demos) { width: 280px; }
  :global(.sv-demos .sv-menu-item) { height: auto; min-height: 28px; align-items: flex-start; padding-block: 6px; line-height: 16px; }
</style>
