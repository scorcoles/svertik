<script lang="ts">
  import NumberField from '../lib/NumberField.svelte';
  import ParamRow from '../lib/ParamRow.svelte';
  import Section from '../lib/Section.svelte';

  let angle = $state(90);
  let radius = $state(0.5);
</script>

<div style="width: 300px; background: var(--sv-surface-panel)">
  <Section title="Shape">
    <ParamRow label="Angle" for="angle"><NumberField id="angle" bind:value={angle} step={1} unit="°" /></ParamRow>
  </Section>
  <Section title="Falloff" open={false}>
    <ParamRow label="Radius" for="radius"><NumberField id="radius" bind:value={radius} /></ParamRow>
  </Section>
</div>
