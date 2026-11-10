<script lang="ts">
  // Varios parámetros seguidos. Une en una sola fila una casilla `x` con su color `xColor`
  // (Fill + Fill color, Stroke + Stroke color): así la casilla y la muestra quedan alineadas.
  import type { ParamSpec } from '@svertik/engine';
  import Checkbox from './Checkbox.svelte';
  import ColorField from './ColorField.svelte';
  import ParamControl from './ParamControl.svelte';
  import ParamRow from './ParamRow.svelte';

  interface Props {
    params: [string, ParamSpec][];
    values: Record<string, unknown> | undefined;
    onchange: (name: string, value: unknown) => void;
  }
  let { params, values, onchange }: Props = $props();

  type Item = { name: string; spec: ParamSpec; color?: string };
  const items = $derived.by(() => {
    const names = new Set(params.map(([n]) => n));
    const out: Item[] = [];
    const paired = new Set<string>();
    for (const [name, spec] of params) {
      if (paired.has(name)) continue;
      const color = `${name}Color`;
      const cs = params.find(([n]) => n === color)?.[1];
      if (spec.type === 'boolean' && names.has(color) && cs?.type === 'color') {
        paired.add(color);
        out.push({ name, spec, color });
      } else out.push({ name, spec });
    }
    return out;
  });
  const labelOf = (name: string, spec: ParamSpec) => spec.label ?? name.charAt(0).toUpperCase() + name.slice(1);
</script>

{#each items as it (it.name)}
  {#if it.color}
    {@const on = values?.[it.name] as boolean}
    <ParamRow label={labelOf(it.name, it.spec)} for={`param-${it.name}`}>
      <Checkbox id={`param-${it.name}`} checked={on} onchange={(v) => onchange(it.name, v)} />
      <span class="color" data-off={!on || undefined}>
        <ColorField value={values?.[it.color] as string} label={`${labelOf(it.name, it.spec)} color`} onchange={(v) => onchange(it.color!, v)} />
      </span>
    </ParamRow>
  {:else}
    <ParamControl name={it.name} spec={it.spec} value={values?.[it.name]} onchange={(v) => onchange(it.name, v)} />
  {/if}
{/each}

<style>
  .color { display: flex; }
  .color[data-off] { opacity: 0.4; }
</style>
