<script lang="ts">
  import NumberField from '../lib/NumberField.svelte';
  import ParamRow from '../lib/ParamRow.svelte';

  let radius = $state(24);
</script>

<div style="width: 280px; display:grid; gap:2px; background: var(--sv-surface-panel); padding: 4px 0;">
  <ParamRow label="Radius" for="radius">
    <NumberField id="radius" bind:value={radius} step={1} min={0} unit="px" />
  </ParamRow>

  <ParamRow label="Opacity" for="opacity" keyState="animated" onkey={() => {}}>
    <NumberField id="opacity" value={0.8} step={0.01} min={0} max={1} />
  </ParamRow>

  <ParamRow label="Scale" for="scale" keyState="key" onkey={() => {}}>
    <NumberField id="scale" value={1} step={0.01} min={0} />
  </ParamRow>
</div>
