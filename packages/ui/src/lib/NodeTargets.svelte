<script lang="ts">
  import IconButton from './IconButton.svelte';
  import ParamRow from './ParamRow.svelte';
  import Select from './Select.svelte';
  import { groupOptions } from './types';

  interface Props {
    value: string[];
    nodes: { id: string; label: string; group?: string }[];
    label?: string;
    onadd: (id: string) => void;
    onremove: (id: string) => void;
    onselect?: (id: string) => void;
  }
  let { value, nodes, label = '', onadd, onremove, onselect }: Props = $props();
  const ADD = '+ Add target';
  const free = $derived(nodes.filter((node) => !value.includes(node.id)));
</script>

{#each value as id, i (id)}
  {@const target = nodes.find((node) => node.id === id)}
  <ParamRow label={i === 0 ? label : ''}>
    <button class="target" type="button" disabled={!target || !onselect} onclick={() => target && onselect?.(id)}>{target?.label ?? 'missing object'}</button>
    <span class="mini"><IconButton icon="trash" label="Remove target" onclick={() => onremove(id)} /></span>
  </ParamRow>
{/each}
<ParamRow label={value.length ? '' : label || 'Add'}>
  <Select value="" options={[{ value: '', label: ADD }, ...groupOptions(free)]} label="Add target" onchange={(id) => { if (id) onadd(id); }} />
</ParamRow>

<style>
  .mini { display: flex; }
  .mini :global(.sv-icon-button) { width: 20px; height: 20px; }
  .target { flex: 1; min-width: 0; padding: 0 var(--sv-space-4); font: inherit; text-align: left; color: var(--sv-text-primary); background: none; border: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  .target:hover { color: var(--sv-accent-text); }
  .target:disabled { color: var(--sv-text-disabled); cursor: default; }
</style>
