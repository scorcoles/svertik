<script lang="ts">
  // Varios parámetros seguidos. Une en una sola fila una casilla `x` con su color `xColor`
  // (Fill + Fill color, Stroke + Stroke color): así la casilla y la muestra quedan alineadas.
  import { convertUnit, formatPercent, isNumericExpression, parsePercent, resolveUnits, type ParamSpec, type UnitContext } from '@svertik/engine';
  import Checkbox from './Checkbox.svelte';
  import PaintField from './PaintField.svelte';
  import ParamControl from './ParamControl.svelte';
  import IconButton from './IconButton.svelte';
  import { proportional } from './link';
  import ParamRow from './ParamRow.svelte';
  import NumberField from './NumberField.svelte';

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
    /** What percentages are measured against (the document): enables the px ↔ % switch on fields that take them. */
    unitContext?: UnitContext;
  }
  let { params, schema, values, onchange, nodes, onselectnode, swatches, fonts, keyOf, onkey, unitContext }: Props = $props();
  // px ↔ %: the same length in the other unit, measured on the other values already in px.
  const allSpecs = $derived(Object.fromEntries(schema ?? params));
  function switchUnit(name: string, spec: ParamSpec, to: 'px' | '%') {
    const px = resolveUnits(allSpecs, { ...Object.fromEntries((schema ?? params).map(([n, sp]) => [n, sp.default])), ...values }, unitContext);
    onchange(name, convertUnit(spec, values?.[name] ?? spec.default, to, px, unitContext));
  }
  const unitFor = (name: string, spec: ParamSpec) => (unitContext && spec.type === 'number' && spec.percentOf ? { onunit: (to: 'px' | '%') => switchUnit(name, spec, to) } : {});
  const k = (name: string, spec: ParamSpec) => (onkey && spec.animatable !== false ? { keyState: keyOf?.(name), onkey: () => onkey(name) } : {});

  type Item = { name: string; spec: ParamSpec; color?: string; pair?: { name: string; spec: ParamSpec }; links?: NonNullable<ParamSpec['links']> };
  // Parejas enlazadas (ancho ↔ alto), por nombre del primero.
  let linked = $state<Record<string, boolean>>({});
  // Each side keeps its own unit (one can be % and the other px): the link scales both by the same ratio.
  const amount = (v: unknown) => parsePercent(v) ?? Number(v ?? 0);
  const inUnitOf = (like: unknown, n: number) => (parsePercent(like) !== null ? formatPercent(n) : n);
  function changePair(a: string, b: string, which: 0 | 1, v: unknown) {
    const n = amount(v);
    if (!linked[a] || !Number.isFinite(n)) return onchange(which === 0 ? a : b, v);
    const cur: [number, number] = [amount(values?.[a]), amount(values?.[b])];
    const [x, y] = proportional(cur, which, n);
    onchange(a, inUnitOf(values?.[a], x));
    onchange(b, inUnitOf(values?.[b], y));
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
    // Linked groups (a boolean with `links`): drawn once, where the first of their values sits.
    const owner = new Map<string, string>();
    for (const [name, spec] of params) if (spec.type === 'boolean' && spec.links) for (const m of [name, spec.links.one, ...spec.links.each]) owner.set(m, name);
    const drawn = new Set<string>();
    for (const [name, spec] of params) {
      const group = owner.get(name);
      if (group) {
        if (!drawn.has(group)) {
          drawn.add(group);
          const gs = params.find(([n]) => n === group)![1];
          out.push({ name: group, spec: gs, links: gs.links! });
        }
        continue;
      }
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
  const specOf = (name: string) => (schema ?? params).find(([n]) => n === name)?.[1];
  const num = (name: string) => Number(values?.[name] ?? (specOf(name) as { default?: number } | undefined)?.default ?? 0);
  const isLinked = (group: string, spec: ParamSpec) => (values?.[group] ?? spec.default) !== false;
  /** Link ↔ unlink, carrying the value across so nothing jumps: the shared value fills every one, or the first one becomes the shared value. */
  function toggleLinks(group: string, links: NonNullable<ParamSpec['links']>, linked: boolean) {
    if (linked) {
      const v = values?.[links.one] ?? num(links.one);
      for (const n of links.each) onchange(n, v);
      onchange(group, false);
    } else {
      onchange(links.one, values?.[links.each[0]!] ?? num(links.each[0]!));
      onchange(group, true);
    }
  }
  /** One animation diamond for a row of several values: keyed if all are, animated if any is. */
  const rowKey = (names: string[]) => {
    if (!onkey) return {};
    const states = names.map((n) => keyOf?.(n) ?? 'none');
    const keyState = states.every((s) => s === 'key') ? 'key' : states.some((s) => s !== 'none') ? 'animated' : 'none';
    return { keyState, onkey: () => names.forEach((n) => onkey(n)) } as const;
  };
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
      <ParamControl name={it.name} spec={it.spec} value={values?.[it.name]} fieldWidth={expanded ? '132px' : '80px'} {...k(it.name, it.spec)} {...unitFor(it.name, it.spec)} onchange={(v) => changePair(it.name, pair.name, 0, v)} />
      <ParamControl name={pair.name} spec={pair.spec} value={values?.[pair.name]} fieldWidth={expanded ? '132px' : '80px'} {...k(pair.name, pair.spec)} {...unitFor(pair.name, pair.spec)} onchange={(v) => changePair(it.name, pair.name, 1, v)} />
      <span class="link" data-on={linked[it.name] || undefined}>
        <IconButton
          icon={linked[it.name] ? 'link' : 'unlink'}
          label={linked[it.name] ? `Unlink ${labelOf(it.name, it.spec)} and ${labelOf(pair.name, pair.spec)}` : `Link ${labelOf(it.name, it.spec)} and ${labelOf(pair.name, pair.spec)} (keep proportion)`}
          active={linked[it.name]}
          onclick={() => (linked = { ...linked, [it.name]: !linked[it.name] })}
        />
      </span>
    </div>
  {:else if it.links}
    {@const links = it.links}
    {@const linked = isLinked(it.name, it.spec)}
    {@const button = { icon: linked ? 'link' : 'unlink', label: linked ? `Set each ${labelOf(links.one, specOf(links.one)!).toLowerCase()} separately` : `Link all to one ${labelOf(links.one, specOf(links.one)!).toLowerCase()}` } as const}
    <!-- One value with a link button beside it; unlinked, its parts two per row, bracketed to the button. -->
    <div class="pair" data-single={linked || undefined}>
      {#if linked}
        <ParamControl name={links.one} spec={specOf(links.one)!} value={values?.[links.one]} fieldWidth="80px" {...k(links.one, specOf(links.one)!)} {...unitFor(links.one, specOf(links.one)!)} onchange={(v) => onchange(links.one, v)} />
      {:else}
        {#each [0, 2] as row (row)}
          {@const names = links.each.slice(row, row + 2)}
          <ParamRow label={row === 0 ? labelOf(it.name, it.spec).replace(/^Link\s+/i, '').replace(/^./, (c) => c.toUpperCase()) : ''} {...rowKey(names)}>
            <span class="each">
              {#each names as n, i (n)}
                {@const sp = specOf(n) as Extract<ParamSpec, { type: 'number' }>}
                {@const pct = sp?.percentOf ? parsePercent(values?.[n]) : null}
                <NumberField value={pct ?? num(n)} step={sp?.step ?? 1} min={sp?.min} max={sp?.max} unit={pct !== null ? '%' : sp?.unit} prefix={links.prefixes?.[row + i] ?? ''} label={labelOf(n, sp)} width="66px"
                  unitAction={unitContext && sp?.percentOf ? { label: `${labelOf(n, sp)}: use ${pct !== null ? 'px' : '%'}`, onclick: () => switchUnit(n, sp, pct !== null ? 'px' : '%') } : undefined}
                  onchange={(v) => onchange(n, pct !== null ? formatPercent(v) : v)} />
              {/each}
            </span>
          </ParamRow>
        {/each}
      {/if}
      <span class="link" data-on={linked || undefined}>
        <IconButton icon={button.icon} label={button.label} active={linked} onclick={() => toggleLinks(it.name, links, linked)} />
      </span>
    </div>
  {:else}
    <ParamControl name={it.name} spec={it.spec} value={values?.[it.name]} {...unitFor(it.name, it.spec)} {nodes} {onselectnode} {swatches} {fonts} {...k(it.name, it.spec)} onchange={(v) => onchange(it.name, v)} />
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
  /* A single row (linked): no bracket, the button sits beside the field. */
  .pair[data-single] .link { grid-row: 1; }
  .pair[data-single] .link::before { display: none; }
  .each { display: flex; gap: var(--sv-space-4); min-width: 0; }
  .link :global(.sv-icon-button) { width: 20px; height: 20px; }
  .color[data-off] { opacity: 0.4; }
</style>
