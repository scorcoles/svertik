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
    /** Para los parámetros `node`: los objetos que se pueden elegir. */
    nodes?: { id: string; label: string }[];
    /** Colores del documento, para las muestras del selector de color. */
    swatches?: string[];
    /** Para los parámetros `font`: las fuentes que se pueden elegir. */
    fonts?: string[];
    keyState?: 'none' | 'animated' | 'key';
    onkey?: () => void;
  }
  let { name, spec, value: given, onchange, nodes = [], swatches, fonts = [], keyState, onkey }: Props = $props();
  // Un parámetro que no viene (proyecto escrito a mano, versión anterior…) se enseña con su valor por defecto.
  const value = $derived(given ?? spec.default);
  // Nombres únicos para el desplegable (dos objetos pueden llamarse igual).
  const NONE = '— none —';
  const nodeLabels = $derived.by(() => {
    const seen = new Map<string, number>();
    return nodes.map((n) => {
      const k = (seen.get(n.label) ?? 0) + 1;
      seen.set(n.label, k);
      return { id: n.id, label: k > 1 ? `${n.label} (${k})` : n.label };
    });
  });
  const id = $derived(`param-${name}`);
  const label = $derived(spec.label ?? name.charAt(0).toUpperCase() + name.slice(1));
  // Iconos para opciones conocidas; el resto se muestra como texto.
  const ICONS: Record<string, IconName> = {
    horizontal: 'axis-h',
    vertical: 'axis-v',
    union: 'bool-union',
    subtract: 'bool-subtract',
    intersect: 'bool-intersect',
    exclude: 'bool-exclude',
  };
  // Botones en vez de desplegable: con pocas opciones, o si todas tienen icono.
  const segmented = $derived(spec.type === 'enum' && (spec.options.length <= 3 || spec.options.every((o) => ICONS[o])));
</script>

<ParamRow {label} for={id} tall={spec.type === 'text'} {keyState} onkey={spec.animatable === false ? undefined : onkey}>
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
    <PointField {id} {label} value={value as [number, number]} step={spec.step ?? 0.01} min={spec.min} linkable={spec.linkable} {onchange} />
  {:else if spec.type === 'enum' && segmented}
    <Segmented value={value as string} {label} options={spec.options.map((o) => ({ value: o, label: o, icon: ICONS[o] }))} {onchange} />
  {:else if spec.type === 'enum'}
    <Select value={value as string} options={spec.options} {label} {onchange} />
  {:else if spec.type === 'color'}
    <ColorField {id} value={value as string} {label} {swatches} {onchange} />
  {:else if spec.type === 'node'}
    <Select
      value={nodeLabels.find((n) => n.id === value)?.label ?? NONE}
      options={[NONE, ...nodeLabels.map((n) => n.label)]}
      {label}
      onchange={(v) => onchange(nodeLabels.find((n) => n.label === v)?.id ?? '')}
    />
  {:else if spec.type === 'text'}
    <!-- Se aplica al dejar de escribir un momento (cada pulsación rehace las letras). -->
    <textarea
      {id}
      class="sv-text"
      rows="2"
      spellcheck="false"
      value={value as string}
      aria-label={label}
      oninput={(e) => onchange(e.currentTarget.value)}
      onkeydown={(e) => e.stopPropagation()}
    ></textarea>
  {:else if spec.type === 'font'}
    <input
      {id}
      class="sv-font"
      list={`${id}-list`}
      spellcheck="false"
      value={value as string}
      aria-label={label}
      onchange={(e) => onchange(e.currentTarget.value)}
      onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
    <datalist id={`${id}-list`}>
      {#each fonts as f (f)}<option value={f}></option>{/each}
    </datalist>
  {:else if spec.type === 'boolean'}
    <Checkbox {id} checked={value as boolean} {onchange} />
  {/if}
</ParamRow>

<style>
  .sv-text, .sv-font {
    flex: 1;
    min-width: 0;
    padding: var(--sv-space-2) var(--sv-space-6);
    font: inherit;
    color: var(--sv-text-primary);
    background: var(--sv-surface-field);
    border: var(--sv-border-1) solid var(--sv-rule-default);
    outline: none;
  }
  .sv-font { height: 20px; }
  .sv-text { resize: vertical; min-height: 36px; }
  .sv-text:focus, .sv-font:focus { border-color: var(--sv-accent-fill); }
</style>
