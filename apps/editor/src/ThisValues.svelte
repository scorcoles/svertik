<script lang="ts">
  import { t } from '@svertik/ui';
  import { isNumericExpression, type ParamSpec } from '@svertik/engine';

  /**
   * The values a formula of this object or effect reads as `this.name`: its numeric parameters (also those left
   * at their default) and, for objects, placement and opacity. A click copies the reference.
   */
  let { schema, values, extra = [], oncopied }: {
    schema: Record<string, ParamSpec>;
    values: Record<string, unknown> | undefined;
    /** More readable values, after the parameters (placement, opacity). */
    extra?: { name: string; label: string; value: unknown }[];
    oncopied: (message: string) => void;
  } = $props();

  const shown = (value: unknown, fallback: number) => {
    const n = typeof value === 'number' ? value : isNumericExpression(value) ? value.fallback : fallback;
    return Math.round(n * 1000) / 1000 + (isNumericExpression(value) ? ' ƒx' : '');
  };
  const rows = $derived([
    ...Object.entries(schema)
      .filter(([, spec]) => spec.type === 'number')
      .map(([name, spec]) => ({ name, label: spec.label ?? name, value: shown(values?.[name], (spec as { default: number }).default) })),
    ...extra.map((e) => ({ name: e.name, label: e.label, value: shown(e.value, 0) })),
  ]);

  async function copy(name: string) {
    const reference = `this.${name}`;
    try {
      await navigator.clipboard.writeText(reference);
      oncopied(t('Copied {reference}', { reference }));
    } catch {
      oncopied(t('Use {reference} in a formula', { reference }));
    }
  }
</script>

{#if rows.length}
  <div class="this-values" aria-label={t('Values for formulas')}>
    {#each rows as row (row.name)}
      <div class="row">
        <button type="button" title={t('Copy {reference}', { reference: `this.${row.name}` })} onclick={() => void copy(row.name)}>this.{row.name}</button>
        <span class="label">{row.label}</span>
        <span class="value">{row.value}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .this-values { font-size: var(--sv-font-size-10); }
  .row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: var(--sv-space-8); align-items: center; min-height: 20px; }
  button { overflow: hidden; padding: 0; color: var(--sv-accent-text); background: transparent; border: 0; font: inherit; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: copy; }
  button:hover { color: var(--sv-text-primary); text-decoration: underline; }
  .label { color: var(--sv-text-muted); }
  .value { min-width: 48px; color: var(--sv-text-primary); text-align: right; }
</style>
