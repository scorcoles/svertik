<script lang="ts">
  // Un parámetro del esquema del motor → su control. Así el esquema dibuja el panel de atributos.
  import type { ParamSpec } from '@svertik/engine';
  import Checkbox from '../lib/Checkbox.svelte';
  import NumberField from '../lib/NumberField.svelte';
  import ParamRow from '../lib/ParamRow.svelte';
  import Select from '../lib/Select.svelte';
  import Slider from '../lib/Slider.svelte';

  interface Props {
    name: string;
    spec: ParamSpec;
    value: unknown;
    onchange: (value: unknown) => void;
  }
  let { name, spec, value, onchange }: Props = $props();
  const id = $derived(`param-${name}`);
  const label = $derived(spec.label ?? name.charAt(0).toUpperCase() + name.slice(1));
</script>

<ParamRow {label} for={id}>
  {#if spec.type === 'number'}
    <NumberField {id} value={value as number} step={spec.step ?? 0.01} min={spec.min} max={spec.max} unit={spec.unit === 'fraction' ? '' : spec.unit} {onchange} />
    {#if spec.min !== undefined && spec.max !== undefined}
      <Slider value={value as number} min={spec.min} max={spec.max} step={spec.step ?? 0.01} label={label} {onchange} />
    {/if}
  {:else if spec.type === 'angle'}
    <NumberField {id} value={value as number} step={1} unit="°" {onchange} />
  {:else if spec.type === 'seed'}
    <NumberField {id} value={value as number} step={1} min={0} {onchange} />
  {:else if spec.type === 'point'}
    {@const p = value as [number, number]}
    <NumberField {id} label={`${label} X`} value={p[0]} step={0.01} onchange={(x) => onchange([x, p[1]])} />
    <NumberField label={`${label} Y`} value={p[1]} step={0.01} onchange={(y) => onchange([p[0], y])} />
  {:else if spec.type === 'enum'}
    <Select value={value as string} options={spec.options} {label} {onchange} />
  {:else if spec.type === 'boolean'}
    <Checkbox {id} checked={value as boolean} {onchange} />
  {/if}
</ParamRow>
