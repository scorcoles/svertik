<script lang="ts">
  import NumberField from './NumberField.svelte';

  interface Props {
    value: [number, number];
    step?: number;
    /** Nombre accesible del punto («Center»): cada campo será «Center X» y «Center Y». */
    label?: string;
    id?: string;
    width?: string;
    onchange?: (value: [number, number]) => void;
  }
  let { value = $bindable(), step = 0.01, label = 'Point', id, width = '64px', onchange }: Props = $props();

  const set = (i: 0 | 1, v: number) => {
    const next: [number, number] = i === 0 ? [v, value[1]] : [value[0], v];
    value = next;
    onchange?.(next);
  };
</script>

<div class="sv-point">
  <NumberField {id} prefix="X" label={`${label} X`} value={value[0]} {step} {width} onchange={(v) => set(0, v)} />
  <NumberField prefix="Y" label={`${label} Y`} value={value[1]} {step} {width} onchange={(v) => set(1, v)} />
</div>

<style>
  .sv-point { display: flex; gap: var(--sv-space-4); }
</style>
