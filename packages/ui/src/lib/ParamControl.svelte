<script lang="ts">
  // Un parámetro del esquema del motor → su control. Así el esquema dibuja el panel de atributos.
  import { formatPercent, isNumericExpression, normalizeHex, parsePercent, validateExpression, type ParamSpec } from '@svertik/engine';
  import Checkbox from './Checkbox.svelte';
  import ColorField from './ColorField.svelte';
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
    /** Numbers that accept percentages: switch to the other unit, keeping the drawing as it is. */
    onunit?: (to: 'px' | '%') => void;
  }
  let { name, spec, value: given, onchange, nodes = [], onselectnode, swatches, fonts = [], fieldWidth, keyState, onkey, onunit }: Props = $props();

  // Text with live values: buttons insert a ready-made token at the caret, so nobody has to learn the
  // {{…}} syntax to get a timer or a countdown.
  let textArea = $state<HTMLTextAreaElement>();
  const liveValues = [
    { label: 'Time', token: '{{fixed(scene.time, 2)}}', title: 'Seconds since the start, two decimals' },
    { label: 'Countdown', token: '{{scene.countDown(10)}}', title: 'Counts down from 10 seconds' },
    { label: 'Frame', token: '{{scene.frame}}', title: 'The current frame number' },
  ];
  function insertLive(token: string) {
    const el = textArea;
    if (!el) return;
    const [a, b] = [el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length];
    const next = el.value.slice(0, a) + token + el.value.slice(b);
    el.value = next;
    onchange(next);
    el.focus();
    el.setSelectionRange(a + token.length, a + token.length);
  }
  // Un parámetro que no viene (proyecto escrito a mano, versión anterior…) se enseña con su valor por defecto.
  const value = $derived(given ?? spec.default);
  // A percentage ("50%") is edited as its number, with % as the unit; every change writes it back as text.
  const percent = $derived(spec.type === 'number' && spec.percentOf ? parsePercent(value) : null);
  const shown = $derived(percent ?? value);
  const emit = (v: number) => onchange(percent !== null ? formatPercent(v) : v);
  const unitAction = $derived(spec.type === 'number' && spec.percentOf && onunit
    ? { label: `${spec.label ?? name.charAt(0).toUpperCase() + name.slice(1)}: use ${percent !== null ? 'px' : '%'}`, onclick: () => onunit?.(percent !== null ? 'px' : '%') }
    : undefined);
  const advanced = $derived((spec.type === 'number' || spec.type === 'seed') && spec.expression !== false);
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
<ParamRow {label} for={id} tall={spec.type === 'text' || spec.type === 'palette'} keyState={expression ? undefined : keyState} onkey={expression || spec.animatable === false ? undefined : onkey} scrub={spec.type === 'number' && !expression ? { value: shown as number, step: spec.step ?? 0.01, min: spec.min, max: spec.max, onchange: emit } : spec.type === 'angle' ? { value: value as number, step: 1, onchange: (v) => onchange(v) } : spec.type === 'seed' && !expression ? { value: value as number, step: 1, min: 0, onchange: (v) => onchange(v) } : undefined}>
  {#if spec.type === 'number' || spec.type === 'seed'}
    {#if expression}
      <div class="expression-control" style={`--sv-field-width: ${numericFieldWidth}`}>
        <div class="expression-field" data-invalid={expressionError || undefined}>
          <input
            class="sv-expression"
            value={expression.$expr}
            aria-label={`${label} expression`}
            aria-invalid={expressionError ? 'true' : undefined}
            title={expressionError ?? 'Use scene.time, scene.cycle, scene.frame, scene.fps, scene.duration, scene.progress, scene.seedGenerator, scene.mouse.posX/posY/fracX/fracY/down/inside/velX/velY/downMs, scene.custom.name; functions: min, max, clamp, lerp, sin, cos, random(min, max, seed?)…'}
            spellcheck="false"
            oninput={(e) => onchange({ ...expression, $expr: e.currentTarget.value })}
            onkeydown={(e) => e.stopPropagation()}
          />
          {#if spec.type === 'number' && spec.unit && spec.unit !== 'fraction'}<span class="expression-unit">{spec.unit}</span>{/if}
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
        value={shown as number}
        step={spec.type === 'seed' ? 1 : spec.step ?? 0.01}
        min={spec.type === 'seed' ? 0 : spec.min}
        max={spec.type === 'seed' ? undefined : spec.max}
        width={advanced ? numericFieldWidth : '72px'}
        unit={percent !== null ? '%' : spec.type === 'number' ? (spec.unit === 'fraction' ? '' : spec.unit) : ''}
        {unitAction}
        trailingAction={advanced && percent === null ? {
          label: `Use an expression for ${label}`,
          title: expression ? 'Expression enabled; switch to a number' : 'Use an expression with scene variables',
          active: !!expression,
          onclick: () => onchange({ $expr: spec.type === 'seed' ? 'scene.seedGenerator' : String(value), fallback: Number(value) }),
        } : undefined}
        onchange={spec.type === 'number' ? emit : onchange}
      />
      {#if spec.type === 'number' && spec.min !== undefined && spec.max !== undefined && percent === null}
        <Slider value={value as number} min={spec.min} max={spec.max} step={spec.step ?? 0.01} curve={spec.sliderCurve} label={label} width={advanced ? '72px' : '100px'} {onchange} />
      {/if}
    {/if}
  {:else if spec.type === 'angle'}
    <NumberField {id} value={value as number} step={1} unit="°" {onchange} />
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
  {:else if spec.type === 'palette'}
    {@const colors = Array.isArray(value) ? value as string[] : spec.default}
    <div class="palette-editor">
      {#each colors as color, i (i)}
        <div class="palette-entry">
          <ColorField value={color} label={`Palette color ${i + 1}`} {swatches} onchange={(v) => onchange(colors.map((c, j) => j === i ? normalizeHex(v) ?? c : c))} />
          <IconButton icon="close" label={`Remove palette color ${i + 1}`} disabled={colors.length <= 1} onclick={() => onchange(colors.filter((_, j) => j !== i))} />
        </div>
      {/each}
      <IconButton icon="plus" label="Add palette color" onclick={() => onchange([...colors, '#ffffff'])} />
    </div>
  {:else if spec.type === 'color'}
    {#if spec.solid}
      <ColorField {id} value={value as string} {label} {swatches} {onchange} />
    {:else}
      <PaintField {id} value={value as any} {label} {swatches} onchange={(v) => onchange(v)} />
    {/if}
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
        bind:this={textArea}
        {id}
        class="sv-text"
        rows="2"
        spellcheck="false"
        value={value as string}
        aria-label={label}
        oninput={(e) => onchange(e.currentTarget.value)}
        onkeydown={(e) => e.stopPropagation()}
      ></textarea>
      {#if spec.expression}
        <div class="text-live" role="group" aria-label="Insert a live value">
          <small class="text-expression-hint">Insert live:</small>
          {#each liveValues as v (v.label)}
            <button type="button" class="text-live-button" title={v.title} onclick={() => insertLive(v.token)}>{v.label}</button>
          {/each}
        </div>
      {/if}
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
  .palette-editor { display: grid; gap: var(--sv-space-4); padding-block: var(--sv-space-2); }
  .palette-entry { display: flex; align-items: center; gap: var(--sv-space-4); }
  .palette-editor :global(.sv-icon-button) { width: 18px; height: 18px; }

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
  .text-expression-hint { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); line-height: 1.3; }
  .text-live { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sv-space-4); }
  .text-live-button {
    height: 20px;
    padding: 0 var(--sv-space-6);
    font: inherit;
    font-size: var(--sv-font-size-11);
    color: var(--sv-text-secondary);
    background: none;
    border: var(--sv-border-1) solid var(--sv-rule-strong);
    cursor: pointer;
  }
  .text-live-button:hover { color: var(--sv-accent-fill); border-color: var(--sv-accent-fill); }
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
    font-size: var(--sv-font-size-11);
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
    color: var(--sv-text-muted);
    background: none;
    border: 0;
    font: inherit;
    font-size: 9px;
    line-height: 1;
    cursor: pointer;
  }
  .expression-toggle:hover,
  .expression-toggle[aria-pressed='true'] { color: var(--sv-accent-fill); }
  .expression-unit { flex: none; color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .sv-text:focus, .sv-font:focus { border-color: var(--sv-accent-fill); }
</style>
