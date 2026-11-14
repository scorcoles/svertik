<script lang="ts">
  // Un parámetro del esquema del motor → su control. Así el esquema dibuja el panel de atributos.
  import { isNumericExpression, validateExpression, type ParamSpec } from '@svertik/engine';
  import Checkbox from './Checkbox.svelte';
  import IconButton from './IconButton.svelte';
  import PaintField from './PaintField.svelte';
  import type { IconName } from './icons';
  import NumberField from './NumberField.svelte';
  import NodeTargets from './NodeTargets.svelte';
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
    onselectnode?: (id: string) => void;
    /** Colores del documento, para las muestras del selector de color. */
    swatches?: string[];
    /** Para los parámetros `font`: las fuentes que se pueden elegir. */
    fonts?: string[];
    /** Width shared by linked numeric fields. */
    fieldWidth?: string;
    keyState?: 'none' | 'animated' | 'key';
    onkey?: () => void;
  }
  let { name, spec, value: given, onchange, nodes = [], onselectnode, swatches, fonts = [], fieldWidth, keyState, onkey }: Props = $props();
  // Un parámetro que no viene (proyecto escrito a mano, versión anterior…) se enseña con su valor por defecto.
  const value = $derived(given ?? spec.default);
  const advanced = $derived(spec.type === 'number' && spec.expression !== false);
  const expression = $derived(advanced && isNumericExpression(value) ? value : null);
  const numericFieldWidth = $derived(fieldWidth ?? (expression ? '132px' : '80px'));
  const expressionError = $derived(expression ? validateExpression(expression.$expr) : null);
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

{#if spec.type === 'nodes'}
  <NodeTargets value={value as string[]} {nodes} {label} onselect={onselectnode} onadd={(id) => onchange([...new Set([...(value as string[]), id])])} onremove={(id) => onchange((value as string[]).filter((node) => node !== id))} />
{:else}
<ParamRow {label} for={id} tall={spec.type === 'text'} keyState={expression ? undefined : keyState} onkey={expression || spec.animatable === false ? undefined : onkey}>
  {#if spec.type === 'number'}
    {#if expression}
      <div class="expression-control" style={`--sv-field-width: ${numericFieldWidth}`}>
        <div class="expression-field" data-invalid={expressionError || undefined}>
          <input
            class="sv-expression"
            value={expression.$expr}
            aria-label={`${label} expression`}
            aria-invalid={expressionError ? 'true' : undefined}
            title={expressionError ?? 'Use scene.time, scene.frame, scene.fps, scene.duration, scene.progress; functions: min, max, clamp, lerp, sin, cos…'}
            spellcheck="false"
            oninput={(e) => onchange({ ...expression, $expr: e.currentTarget.value })}
            onkeydown={(e) => e.stopPropagation()}
          />
          {#if spec.unit && spec.unit !== 'fraction'}<span class="expression-unit">{spec.unit}</span>{/if}
          <button
            class="expression-toggle"
            type="button"
            aria-label={`Use a number for ${label}`}
            aria-pressed="true"
            title="Switch to a number"
            onclick={() => onchange(expression.fallback)}
          >ƒx</button>
        </div>
        {#if expressionError}<span class="expression-error" role="status">{expressionError}</span>{/if}
      </div>
    {:else}
      <NumberField
        {id}
        value={value as number}
        step={spec.step ?? 0.01}
        min={spec.min}
        max={spec.max}
        width={advanced ? numericFieldWidth : '72px'}
        unit={spec.unit === 'fraction' ? '' : spec.unit}
        trailingAction={advanced ? {
          label: `Use an expression for ${label}`,
          title: expression ? 'Expression enabled; switch to a number' : 'Use an expression with scene time variables',
          active: !!expression,
          onclick: () => onchange({ $expr: String(value), fallback: Number(value) }),
        } : undefined}
        {onchange}
      />
      {#if spec.min !== undefined && spec.max !== undefined}
        <Slider value={value as number} min={spec.min} max={spec.max} step={spec.step ?? 0.01} curve={spec.sliderCurve} label={label} width={advanced ? '72px' : '100px'} {onchange} />
      {/if}
    {/if}
  {:else if spec.type === 'angle'}
    <NumberField {id} value={value as number} step={1} unit="°" {onchange} />
  {:else if spec.type === 'seed'}
    <NumberField {id} value={value as number} step={1} min={0} {onchange} />
  {:else if spec.type === 'point'}
    <PointField {id} {label} value={value as [number, number]} step={spec.step ?? 0.01} min={spec.min} linkable={spec.linkable} startLinked={spec.linked} {onchange} />
    {#if spec.unit === 'fraction' && spec.handle !== false}
      {@const at = value as [number, number]}
      <!-- Un lugar del dibujo (centro, pivote…): vuelve a donde estaba al principio. -->
      <span class="reset">
        <IconButton
          icon="center"
          label={`Reset ${label}`}
          disabled={at[0] === spec.default[0] && at[1] === spec.default[1]}
          onclick={() => onchange([...spec.default])}
        />
      </span>
    {/if}
  {:else if spec.type === 'enum' && segmented}
    <Segmented value={value as string} {label} options={spec.options.map((o) => ({ value: o, label: o, icon: ICONS[o] }))} {onchange} />
  {:else if spec.type === 'enum'}
    <Select value={value as string} options={spec.options} {label} {onchange} />
  {:else if spec.type === 'color'}
    <PaintField {id} value={value as any} {label} {swatches} onchange={(v) => onchange(v)} />
  {:else if spec.type === 'node'}
    <Select
      value={nodeLabels.find((n) => n.id === value)?.label ?? NONE}
      options={[NONE, ...nodeLabels.map((n) => n.label)]}
      {label}
      onchange={(v) => onchange(nodeLabels.find((n) => n.label === v)?.id ?? '')}
    />
  {:else if spec.type === 'text'}
    <!-- Se aplica al dejar de escribir un momento (cada pulsación rehace las letras). -->
    <div class="text-control">
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
      {#if spec.expression}<small class="text-expression-hint">Use &#123;&#123;scene.time&#125;&#125;, &#123;&#123;fixed(scene.time, 2)&#125;&#125;, or &#123;&#123;fixed(scene.time, 2, 2)&#125;&#125; for live values.</small>{/if}
    </div>
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
{/if}

<style>
  .reset { display: flex; }
  .reset :global(.sv-icon-button) { width: 18px; height: 18px; }
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
  .text-control { display: flex; flex: 1; flex-direction: column; min-width: 0; gap: var(--sv-space-2); }
  .text-expression-hint { color: var(--sv-text-muted); font-size: var(--sv-font-size-9); line-height: 1.3; }
  .expression-control { position: relative; display: flex; flex: 0 0 var(--sv-field-width, 132px); flex-direction: column; width: var(--sv-field-width, 132px); min-width: 0; }
  .expression-field {
    display: flex;
    align-items: center;
    gap: var(--sv-space-4);
    width: 100%;
    height: 20px;
    min-width: 0;
    padding: 0 var(--sv-space-6);
    box-sizing: border-box;
    background: var(--sv-surface-field);
    border: var(--sv-border-1) solid var(--sv-rule-default);
  }
  .expression-field:focus-within { outline: 1px solid var(--sv-accent-fill); outline-offset: 1px; }
  .expression-field[data-invalid] { border-color: var(--sv-signal-error); }
  .expression-error {
    position: absolute;
    z-index: 4;
    top: calc(100% + var(--sv-space-4));
    left: 0;
    width: 100%;
    max-width: 100%;
    padding: var(--sv-space-4) var(--sv-space-6);
    box-sizing: border-box;
    color: var(--sv-signal-error);
    background: var(--sv-surface-panel);
    border: var(--sv-border-1) solid var(--sv-signal-error);
    font-size: var(--sv-font-size-9);
    line-height: 1.3;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .sv-expression {
    flex: 1;
    min-width: 0;
    padding: 0;
    box-sizing: border-box;
    color: var(--sv-text-primary);
    background: none;
    border: 0;
    outline: none;
    font: inherit;
  }
  .expression-toggle {
    flex: none;
    width: 12px;
    height: 16px;
    padding: 0;
    color: var(--sv-text-disabled);
    background: none;
    border: 0;
    font: inherit;
    font-size: 8px;
    line-height: 1;
    cursor: pointer;
  }
  .expression-toggle:hover,
  .expression-toggle[aria-pressed='true'] { color: var(--sv-accent-fill); }
  .expression-unit { flex: none; color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .sv-text:focus, .sv-font:focus { border-color: var(--sv-accent-fill); }
</style>
