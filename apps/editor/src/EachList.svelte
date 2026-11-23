<script lang="ts">
  // Each: per-copy values for a shape's own parameters. Every row is one parameter and its formula, which reads
  // element.* (the copy being built by the Clone at the top of the stack).
  import { IconButton, Section, Select, formulaField } from '@svertik/ui';
  import { isNumericExpression, validateExpression, type ParamSchema } from '@svertik/engine';
  import InfoTip from './InfoTip.svelte';

  interface Props {
    each: Record<string, unknown>;
    /** The shape's parameters (to offer only numeric ones, with their labels). */
    schema: ParamSchema;
    values: Record<string, unknown>;
    /** Whether the first effect is a Clone (Each only applies then). */
    active: boolean;
    showInfo?: boolean;
    onchange: (each: Record<string, unknown>) => void;
  }
  let { each, schema, values, active, showInfo = true, onchange }: Props = $props();

  const numeric = $derived(Object.entries(schema).filter(([, spec]) => spec.type === 'number').map(([key, spec]) => ({ value: key, label: spec.label ?? key })));
  const free = $derived(numeric.filter((o) => !Object.hasOwn(each, o.value)));
  const current = (key: string) => {
    const v = values[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : isNumericExpression(v) ? v.fallback : 0;
  };
  const formulaOf = (key: string, value: unknown) => (isNumericExpression(value) ? value.$expr : typeof value === 'number' ? String(value) : String(current(key)));

  function add() {
    const next = free[0];
    if (!next) return;
    const n = current(next.value);
    onchange({ ...each, [next.value]: { $expr: String(n), fallback: n } });
  }
  function set(key: string, source: string) {
    onchange({ ...each, [key]: { $expr: source, fallback: current(key) } });
  }
  function rekey(from: string, to: string) {
    if (from === to || Object.hasOwn(each, to)) return;
    onchange(Object.fromEntries(Object.entries(each).map(([k, v]) => [k === from ? to : k, v])));
  }
  function remove(key: string) {
    const next = { ...each };
    delete next[key];
    onchange(next);
  }
</script>

<Section title="Each">
  {#snippet action()}<div class="section-actions">{#if showInfo}<InfoTip text="Per-copy values for this shape's parameters, when its first effect is a Clone. Formulas read element.index, element.count, element.row, element.column, element.u and element.v (0–1 across the grid), element.distance (0 at the centre, 1 at the furthest copy) and element.random." />{/if}<IconButton icon="plus" label="Add a per-copy value" disabled={!free.length} onclick={add} /></div>{/snippet}
  {#if Object.keys(each).length && !active}
    <p class="note">Each applies when the first effect is a Clone.</p>
  {/if}
  {#each Object.entries(each) as [key, value] (key)}
    {@const source = formulaOf(key, value)}
    {@const error = validateExpression(source)}
    <div class="row">
      <Select value={key} options={[...numeric.filter((o) => o.value === key), ...free]} label="Parameter" width="100%" onchange={(to) => rekey(key, to)} />
      <div class="formula">
        <div class="variable-expression" data-invalid={error || undefined}><input class="expression-input" value={source} aria-label={`${key} per copy`} aria-invalid={error ? 'true' : undefined} spellcheck="false"
          title={error ?? 'A formula per copy: element.distance, element.u, element.index… plus props, scene variables and math functions.'}
          oninput={(e) => set(key, e.currentTarget.value)}
          use:formulaField={{ label: `${key} per copy`, commit: (next) => set(key, next) }}
          onkeydown={(e) => e.stopPropagation()} /></div>
        <IconButton icon="trash" label={`Remove ${key} per copy`} onclick={() => remove(key)} />
      </div>
      {#if error}<span class="expression-error" role="status">{error}</span>{/if}
    </div>
  {/each}
</Section>

<style>
  .section-actions { display: inline-flex; align-items: center; gap: var(--sv-space-4); }
  .note { margin: 0; padding: var(--sv-space-4) var(--sv-space-8); color: var(--sv-text-secondary); }
  .row { display: flex; flex-direction: column; gap: var(--sv-space-4); padding: var(--sv-space-4) var(--sv-space-8) var(--sv-space-6); }
  .formula { display: flex; align-items: center; gap: var(--sv-space-4); }
  .variable-expression { display: flex; flex: 1 1 auto; align-items: center; height: 20px; min-width: 0; padding: 0 var(--sv-space-6); box-sizing: border-box; background: var(--sv-surface-field); border: var(--sv-border-1) solid var(--sv-rule-default); }
  .variable-expression:focus-within { outline: 1px solid var(--sv-accent-fill); outline-offset: 1px; }
  .variable-expression[data-invalid] { border-color: var(--sv-signal-error); }
  .expression-input { flex: 1; min-width: 0; padding: 0; color: var(--sv-text-primary); background: none; border: 0; outline: none; font: inherit; }
  .expression-error { color: var(--sv-signal-error); font-size: var(--sv-font-size-11); line-height: 1.3; overflow-wrap: anywhere; }
</style>
