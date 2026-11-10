<script lang="ts">
  import IconButton from './IconButton.svelte';
  import { proportional } from './link';
  import NumberField from './NumberField.svelte';

  interface Props {
    value: [number, number];
    step?: number;
    /** Nombre accesible del punto («Center»): cada campo será «Center X» y «Center Y». */
    label?: string;
    id?: string;
    width?: string;
    onchange?: (value: [number, number]) => void;
    /** Con candado: X e Y se enlazan y cambian en proporción. */
    linkable?: boolean;
    min?: number;
  }
  let { value = $bindable(), step = 0.01, label = 'Point', id, width = '64px', onchange, linkable = false, min }: Props = $props();
  let linked = $state(false);

  const set = (i: 0 | 1, v: number) => {
    let next: [number, number] = i === 0 ? [v, value[1]] : [value[0], v];
    if (linked) next = proportional(value, i, v);
    value = next;
    onchange?.(next);
  };
</script>

<div class="sv-point">
  <NumberField {id} prefix="X" label={`${label} X`} value={value[0]} {step} {min} {width} onchange={(v) => set(0, v)} />
  <NumberField prefix="Y" label={`${label} Y`} value={value[1]} {step} {min} {width} onchange={(v) => set(1, v)} />
  {#if linkable}
    <IconButton icon={linked ? 'link' : 'unlink'} label={linked ? `Unlink ${label} X and Y` : `Link ${label} X and Y (keep proportion)`} active={linked} onclick={() => (linked = !linked)} />
  {/if}
</div>

<style>
  .sv-point { display: flex; align-items: center; gap: var(--sv-space-4); }
  .sv-point :global(.sv-icon-button) { width: 20px; height: 20px; }
</style>
