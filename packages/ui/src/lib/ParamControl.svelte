<script lang="ts">
  // Un parámetro del esquema del motor → su control. Así el esquema dibuja el panel de atributos.
  import type { ParamSpec } from '@svertik/engine';
  import Checkbox from './Checkbox.svelte';
  import ColorField from './ColorField.svelte';
  import type { IconName } from './icons';
  import NumberField from './NumberField.svelte';
  import ParamRow from './ParamRow.svelte';
  import PointField from './PointField.svelte';
  import Segmented from './Segmented.svelte';
  import Select from './Select.svelte';
  import Slider from './Slider.svelte';

  interface Props {
    name: string;
    spec: ParamSpec;
    value: unknown;
    onchange: (value: unknown) => void;
  }
  let { name, spec, value, onchange }: Props = $props();
  const id = $derived(`param-${name}`);
  const label = $derived(spec.label ?? name.charAt(0).toUpperCase() + name.slice(1));
  // Iconos para opciones conocidas; el resto se muestra como texto.
  const ICONS: Record<string, IconName> = { horizontal: 'axis-h', vertical: 'axis-v' };
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
    <PointField {id} {label} value={value as [number, number]} {onchange} />
  {:else if spec.type === 'enum' && spec.options.length <= 3}
    <Segmented value={value as string} {label} options={spec.options.map((o) => ({ value: o, label: o, icon: ICONS[o] }))} {onchange} />
  {:else if spec.type === 'enum'}
    <Select value={value as string} options={spec.options} {label} {onchange} />
  {:else if spec.type === 'color'}
    <ColorField {id} value={value as string} {label} {onchange} />
  {:else if spec.type === 'boolean'}
    <Checkbox {id} checked={value as boolean} {onchange} />
  {/if}
</ParamRow>
