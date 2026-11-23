<script lang="ts">
  import Panel from '../lib/Panel.svelte';
</script>

<div style="display:grid; gap:12px;">
  <Panel title="Properties" meta="12 nodes">
    <div style="padding: 8px; color: var(--sv-text-secondary); font-size: var(--sv-font-size-10);">
      Panel content follows the Svertik inspector layout decisions from code.
    </div>
  </Panel>

  <Panel title="Layers">
    {#snippet actions()}
      <span style="color: var(--sv-text-muted); font-size: var(--sv-font-size-10);">actions</span>
    {/snippet}
    <div style="padding: 8px; color: var(--sv-text-secondary); font-size: var(--sv-font-size-10);">
      Custom header actions slot.
    </div>
  </Panel>
</div>
