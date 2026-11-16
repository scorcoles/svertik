<script lang="ts">
  // Varios parámetros seguidos. Une en una sola fila una casilla `x` con su color `xColor`
  // (Fill + Fill color, Stroke + Stroke color): así la casilla y la muestra quedan alineadas.
  import { isNumericExpression, type ParamSpec } from '@svertik/engine';
  import Checkbox from './Checkbox.svelte';
  import PaintField from './PaintField.svelte';
  import ParamControl from './ParamControl.svelte';
  import IconButton from './IconButton.svelte';
  import { proportional } from './link';
  import ParamRow from './ParamRow.svelte';

  interface Props {
    params: [string, ParamSpec][];
    /** Full modifier schema, needed when a visibility condition refers to a parameter in another group. */
    schema?: [string, ParamSpec][];
    values: Record<string, unknown> | undefined;
    onchange: (name: string, value: unknown) => void;
    /** Objetos que se pueden elegir en los parámetros `node`. */
    nodes?: { id: string; label: string }[];
    onselectnode?: (id: string) => void;
    /** Colores del documento (muestras del selector de color). */
    swatches?: string[];
    /** Fuentes disponibles (parámetros `font`). */
    fonts?: string[];
    /** Animación: estado del rombo de cada parámetro y qué hacer al pulsarlo. */
    keyOf?: (name: string) => 'none' | 'animated' | 'key';
    onkey?: (name: string) => void;
  }
  let { params, schema, values, onchange, nodes, onselectnode, swatches, fonts, keyOf, onkey }: Props = $props();
  const k = (name: string, spec: ParamSpec) => (onkey && spec.animatable !== false ? { keyState: keyOf?.(name), onkey: () => onkey(name) } : {});

  type Item = { name: string; spec: ParamSpec; color?: string; pair?: { name: string; spec: ParamSpec } };
  // Parejas enlazadas (ancho ↔ alto), por nombre del primero.
  let linked = $state<Record<string, boolean>>({});
  function changePair(a: string, b: string, which: 0 | 1, v: number) {
    const cur: [number, number] = [Number(values?.[a] ?? 0), Number(values?.[b] ?? 0)];
    if (!linked[a] || !Number.isFinite(v)) return onchange(which === 0 ? a : b, v);
    const [x, y] = proportional(cur, which, v);
    onchange(a, x);
    onchange(b, y);
  }
  // Los que dependen de otro parámetro (`showIf`) solo salen cuando este tiene uno de sus valores.
  const shown = (spec: ParamSpec) =>
    !spec.showIf ||
    Object.entries(spec.showIf).every(([other, allowed]) => {
      const v = values?.[other] ?? (schema ?? params).find(([n]) => n === other)?.[1].default;
      return allowed.includes(String(v));
    });
  const items = $derived.by(() => {
    const names = new Set(params.map(([n]) => n));
    const out: Item[] = [];
    const paired = new Set<string>();
    for (const [name, spec] of params) {
      if (paired.has(name) || !shown(spec)) continue;
      const color = `${name}Color`;
      const cs = params.find(([n]) => n === color)?.[1];
      const ps = spec.pair ? params.find(([n]) => n === spec.pair)?.[1] : undefined;
      if (spec.type === 'boolean' && names.has(color) && cs?.type === 'color') {
        paired.add(color);
        out.push({ name, spec, color });
      } else if (spec.type === 'number' && spec.pair && ps?.type === 'number') {
        paired.add(spec.pair);
        out.push({ name, spec, pair: { name: spec.pair, spec: ps } });
      } else out.push({ name, spec });
    }
    return out;
  });
  const labelOf = (name: string, spec: ParamSpec) => spec.label ?? name.charAt(0).toUpperCase() + name.slice(1);
</script>

{#each items as it (it.name)}
  {#if it.color}
    {@const on = values?.[it.name] as boolean}
    <ParamRow label={labelOf(it.name, it.spec)} for={`param-${it.name}`} {...k(it.color!, params.find(([n]) => n === it.color)![1])}>
      <Checkbox id={`param-${it.name}`} checked={on} onchange={(v) => onchange(it.name, v)} />
      <span class="color" data-off={!on || undefined}>
        <PaintField value={values?.[it.color] as any} label={`${labelOf(it.name, it.spec)} color`} {swatches} onchange={(v) => onchange(it.color!, v)} />
      </span>
    </ParamRow>
  {:else if it.pair}
    {@const pair = it.pair}
    {@const expanded = isNumericExpression(values?.[it.name]) || isNumericExpression(values?.[pair.name])}
    <div class="pair">
      <ParamControl name={it.name} spec={it.spec} value={values?.[it.name]} fieldWidth={expanded ? '132px' : '80px'} {...k(it.name, it.spec)} onchange={(v) => changePair(it.name, pair.name, 0, v as number)} />
      <ParamControl name={pair.name} spec={pair.spec} value={values?.[pair.name]} fieldWidth={expanded ? '132px' : '80px'} {...k(pair.name, pair.spec)} onchange={(v) => changePair(it.name, pair.name, 1, v as number)} />
      <span class="link" data-on={linked[it.name] || undefined}>
        <IconButton
          icon={linked[it.name] ? 'link' : 'unlink'}
          label={linked[it.name] ? `Unlink ${labelOf(it.name, it.spec)} and ${labelOf(pair.name, pair.spec)}` : `Link ${labelOf(it.name, it.spec)} and ${labelOf(pair.name, pair.spec)} (keep proportion)`}
          active={linked[it.name]}
          onclick={() => (linked = { ...linked, [it.name]: !linked[it.name] })}
        />
      </span>
    </div>
  {:else}
    <ParamControl name={it.name} spec={it.spec} value={values?.[it.name]} {nodes} {onselectnode} {swatches} {fonts} {...k(it.name, it.spec)} onchange={(v) => onchange(it.name, v)} />
  {/if}
{/each}

<style>
  .color { display: flex; }
  /* El candado, a la derecha de los dos campos, entre las dos filas, con un corchete que las une. */
  .pair { display: grid; grid-template-columns: minmax(0, 1fr) 28px; }
  .pair > :global(.sv-param) { grid-column: 1; min-width: 0; }
  .pair :global(.sv-slider) { min-width: 0; }
  .link { position: relative; grid-column: 2; grid-row: 1 / 3; align-self: center; justify-self: start; display: flex; align-items: center; }
  .link::before { content: ''; position: absolute; left: -6px; top: -7px; bottom: -7px; width: 4px; border: 1px solid var(--sv-rule-strong); border-left: 0; }
  .link[data-on]::before { border-color: var(--sv-accent-fill); }
  .link :global(.sv-icon-button) { width: 20px; height: 20px; }
  .color[data-off] { opacity: 0.4; }
</style>
