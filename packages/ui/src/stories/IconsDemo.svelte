<script lang="ts">
  import Icon from '../lib/Icon.svelte';
  import { icons, type IconName } from '../lib/icons';

  const names = Object.keys(icons) as IconName[];
</script>

<div class="grid">
  {#each names as name (name)}
    <figure>
      <Icon {name} />
      <figcaption>{name}</figcaption>
    </figure>
  {/each}
</div>

<style>
  .grid { display: grid; grid-template-columns: repeat(6, 96px); gap: 1px; background: var(--sv-rule-default); border: 1px solid var(--sv-rule-default); }
  figure { margin: 0; display: grid; justify-items: center; gap: 8px; padding: 16px 4px; background: var(--sv-surface-panel); color: var(--sv-text-primary); }
  figcaption { font-size: var(--sv-font-size-10); color: var(--sv-text-muted); }
</style>
