<script lang="ts">
  import Checkbox from './Checkbox.svelte';

  interface Props {
    label: string;
    kind?: 'object' | 'deformer' | 'generator';
    /** Nivel en el árbol: 0 para el objeto, 1 para sus modificadores… */
    depth?: number;
    /** Si tiene hijos: plegado o desplegado. Sin valor, no hay flecha. */
    expanded?: boolean;
    selected?: boolean;
    enabled?: boolean;
    onselect?: () => void;
    ontoggle?: (enabled: boolean) => void;
    onexpand?: (expanded: boolean) => void;
  }
  let {
    label,
    kind = 'deformer',
    depth = kind === 'object' ? 0 : 1,
    expanded,
    selected = false,
    enabled = $bindable(true),
    onselect,
    ontoggle,
    onexpand,
  }: Props = $props();
</script>

<div
  class="sv-stack-item"
  role="treeitem"
  aria-selected={selected}
  aria-level={depth + 1}
  aria-expanded={expanded}
  data-kind={kind}
  data-selected={selected || undefined}
  data-disabled={!enabled || undefined}
  style:--depth={depth}
  tabindex="0"
  onclick={onselect}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onselect?.(); }
    else if (expanded !== undefined && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); onexpand?.(e.key === 'ArrowRight'); }
  }}
>
  {#if expanded !== undefined}
    <button
      type="button"
      class="chevron"
      tabindex="-1"
      aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
      onclick={(e) => { e.stopPropagation(); onexpand?.(!expanded); }}
    >{expanded ? '▾' : '▸'}</button>
  {:else}
    <span class="chevron" aria-hidden="true"></span>
  {/if}
  <span class="icon" aria-hidden="true"></span>
  <span class="label">{label}</span>
  {#if kind !== 'object'}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <span class="toggle" onclick={(e) => e.stopPropagation()}>
      <Checkbox bind:checked={enabled} label={`Enable ${label}`} onchange={ontoggle} />
    </span>
  {/if}
</div>

<style>
  .sv-stack-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--sv-space-6);
    height: var(--sv-size-row);
    padding: 0 var(--sv-space-8) 0 calc(var(--sv-space-4) + var(--depth) * var(--sv-space-12));
    background: var(--sv-surface-panel);
    cursor: default;
    user-select: none;
  }
  .sv-stack-item[data-kind='object'] { font-weight: var(--sv-font-weight-bold); }
  .sv-stack-item:hover { background: var(--sv-surface-hover); }
  .sv-stack-item[data-selected] { background: var(--sv-accent-selection); }
  .sv-stack-item[data-selected]::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 2px;
    background: var(--sv-accent-fill);
  }
  .sv-stack-item:focus-visible { outline-offset: -1px; }
  .chevron {
    flex: none;
    width: 10px;
    padding: 0;
    font: inherit;
    font-size: var(--sv-font-size-10);
    color: var(--sv-text-muted);
    background: none;
    border: 0;
    cursor: pointer;
  }
  .icon { flex: none; width: 8px; height: 8px; border: var(--sv-border-1) solid var(--sv-text-secondary); }
  [data-kind='object'] .icon { width: 10px; height: 10px; }
  [data-kind='generator'] .icon { background: var(--sv-text-secondary); }
  .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  [data-disabled] .label { color: var(--sv-text-disabled); }
  [data-disabled] .icon { border-color: var(--sv-text-disabled); }
  [data-disabled][data-kind='generator'] .icon { background: var(--sv-text-disabled); }
  /* El interruptor solo se ve al pasar, en la fila seleccionada, con foco o si está apagado. */
  .toggle { display: flex; visibility: hidden; }
  .sv-stack-item:hover .toggle,
  .sv-stack-item:focus-within .toggle,
  [data-selected] .toggle,
  [data-disabled] .toggle { visibility: visible; }
</style>
