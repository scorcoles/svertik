<script lang="ts">
  import Tabs from '../lib/Tabs.svelte';

  let value = $state('Params');
</script>

<div style="width: 300px; background: var(--sv-surface-panel)">
  <Tabs bind:value tabs={['Params', 'Falloff', 'Info']}>
    {#snippet children(tab)}
      <p style="margin: 0; padding: 12px 8px; color: var(--sv-text-secondary)">{tab} content</p>
    {/snippet}
  </Tabs>
</div>
