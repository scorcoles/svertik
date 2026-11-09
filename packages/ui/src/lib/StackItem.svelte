<script lang="ts">
  import Checkbox from './Checkbox.svelte';

  interface Props {
    label: string;
    kind?: 'object' | 'deformer' | 'generator';
    selected?: boolean;
    enabled?: boolean;
    onselect?: () => void;
    ontoggle?: (enabled: boolean) => void;
  }
  let { label, kind = 'deformer', selected = false, enabled = $bindable(true), onselect, ontoggle }: Props = $props();
</script>

<div
  class="sv-stack-item"
  role="option"
  aria-selected={selected}
  data-kind={kind}
  data-selected={selected || undefined}
  data-disabled={!enabled || undefined}
  tabindex="0"
  onclick={onselect}
  onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onselect?.())}
>
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
    gap: var(--sv-space-8);
    height: var(--sv-size-row);
    padding: 0 var(--sv-space-8) 0 20px;
    background: var(--sv-surface-panel);
    cursor: default;
    user-select: none;
  }
  .sv-stack-item[data-kind='object'] { padding-left: var(--sv-space-8); font-weight: var(--sv-font-weight-bold); }
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
  .icon { flex: none; width: 8px; height: 8px; border: var(--sv-border-1) solid var(--sv-text-secondary); }
  [data-kind='object'] .icon { width: 10px; height: 10px; }
  [data-kind='generator'] .icon { background: var(--sv-text-secondary); }
  .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  [data-disabled] .label { color: var(--sv-text-disabled); }
  [data-disabled] .icon { border-color: var(--sv-text-disabled); }
  [data-disabled][data-kind='generator'] .icon { background: var(--sv-text-disabled); }
  .toggle { display: flex; }
</style>
