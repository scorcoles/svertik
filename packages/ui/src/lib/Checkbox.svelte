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
/>

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
  :global(.sv-checkbox[data-state='checked']) { background: var(--sv-accent-fill); border-color: var(--sv-accent-fill); }
  :global(.sv-checkbox:disabled) { opacity: 0.4; cursor: default; }
</style>
