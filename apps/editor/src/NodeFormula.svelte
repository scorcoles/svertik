<script lang="ts">
  import { t } from '@svertik/ui';
  import { FormulaButton } from '@svertik/ui';
  import { validateExpression, type NumericExpression } from '@svertik/engine';

  // An object value (position, scale, rotation, opacity) that holds a formula: it shows it, opens it in the
  // formula editor, and ƒx turns it back into a number (its last value).
  let { label, value, onchange }: { label: string; value: NumericExpression; onchange: (next: number | NumericExpression) => void } = $props();
  const error = $derived(validateExpression(value.$expr));
</script>

<div class="node-formula" data-invalid={error || undefined}>
  <FormulaButton {label} value={value.$expr} {error} commit={(next) => onchange({ ...value, $expr: next })} />
  <button type="button" class="toggle" aria-pressed="true" aria-label={t('Use a number for {name}', { name: label })} title={t('Switch to a number')} onclick={() => onchange(value.fallback)}>ƒx</button>
</div>

<style>
  .node-formula { display: flex; flex: 1; align-items: center; gap: 4px; min-width: 0; height: 22px; padding: 0 4px 0 6px; background: var(--sv-surface-field); border: var(--sv-border-1) solid var(--sv-rule-default); }
  .node-formula[data-invalid] { border-color: var(--sv-signal-error); }
  .toggle { flex: none; padding: 0; color: var(--sv-accent-text); background: none; border: 0; font: inherit; font-size: 9px; cursor: pointer; }
</style>
