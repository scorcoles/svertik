<script lang="ts">
  interface Props { value: number; onchange: (value: number) => void }
  let { value, onchange }: Props = $props();
</script>

<div class="zoom" role="group" aria-label="Text size">
  <button type="button" aria-label="Decrease text size" title="Decrease text size" disabled={value <= 80} onclick={() => onchange(value - 10)}>A−</button>
  <button class="value" type="button" aria-label="Reset text size to 100 percent" title="Reset text size" onclick={() => onchange(100)}>{value}%</button>
  <button type="button" aria-label="Increase text size" title="Increase text size" disabled={value >= 180} onclick={() => onchange(value + 10)}>A+</button>
</div>

<style>
  .zoom { display: inline-flex; align-items: center; gap: var(--sv-space-4); margin-right: var(--sv-space-8); }
  button {
    min-width: 24px;
    height: 20px;
    padding: 0 var(--sv-space-4);
    color: var(--sv-text-secondary);
    background: none;
    border: var(--sv-border-1) solid var(--sv-rule-default);
    font: inherit;
    cursor: pointer;
  }
  button:hover:not(:disabled) { color: var(--sv-text-primary); border-color: var(--sv-rule-strong); }
  button:disabled { opacity: 0.4; cursor: default; }
  .value { min-width: 38px; color: var(--sv-text-muted); }
</style>
