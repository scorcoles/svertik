<script lang="ts">
  import { Checkbox } from 'bits-ui';

  interface Props {
    checked: boolean;
    label?: string;
    id?: string;
    disabled?: boolean;
    onchange?: (checked: boolean) => void;
  }
  let { checked = $bindable(), label, id, disabled = false, onchange }: Props = $props();
</script>

<Checkbox.Root
  bind:checked
  {id}
  {disabled}
  aria-label={label}
  onCheckedChange={(v) => onchange?.(v)}
  class="sv-checkbox"
>
  {#snippet children({ checked: on })}
    <!-- Marcada: una marca, no un cuadro relleno (que se confundía con una muestra de color). -->
    {#if on}<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.25l2.25 2.25 4.75-5" /></svg>{/if}
  {/snippet}
</Checkbox.Root>

<style>
  :global(.sv-checkbox) {
    flex: none;
    width: 12px;
    height: 12px;
    padding: 0;
    border: var(--sv-border-1) solid var(--sv-rule-strong);
    border-radius: var(--sv-radius-none);
    background: none;
    cursor: pointer;
  }
  :global(.sv-checkbox:hover) { border-color: var(--sv-text-muted); }
  :global(.sv-checkbox) { display: inline-grid; place-items: center; }
  :global(.sv-checkbox[data-state='checked']) { border-color: var(--sv-accent-fill); }
  :global(.sv-checkbox svg) { width: 10px; height: 10px; fill: none; stroke: var(--sv-accent-fill); stroke-width: 1.5; stroke-linecap: square; }
  :global(.sv-checkbox:disabled) { opacity: 0.4; cursor: default; }
</style>
