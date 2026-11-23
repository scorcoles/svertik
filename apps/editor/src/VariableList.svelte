<script lang="ts">
  import { tick } from 'svelte';
  import { IconButton, NumberField, Section, Slider, formulaField } from '@svertik/ui';
  import { customNumber, isNumericExpression, isRangedVariable, validateExpression, type CustomVariable, type RangedVariable } from '@svertik/engine';
  import InfoTip from './InfoTip.svelte';

  interface Props {
    title: string;
    open?: boolean;
    values: Record<string, unknown>;
    namespace: string;
    prefix?: string;
    addLabel?: string;
    reserved?: string[];
    allowRanges?: boolean;
    showInfo?: boolean;
    info: string;
    onchange: (name: string, value: CustomVariable | unknown) => void;
    onremove: (name: string) => void;
    onrename: (from: string, to: string) => void;
  }
  let { title, open = $bindable(true), values, namespace, prefix = 'var', addLabel = `Add ${title.toLowerCase().replace(/s$/, '')}`, reserved = [], allowRanges = false, info, showInfo = true, onchange, onremove, onrename }: Props = $props();
  const NAME = /^[A-Za-z_][A-Za-z_0-9]*$/;
  let renaming = $state<string | null>(null);
  let rangeOpen = $state<Record<string, boolean>>({});

  async function add() {
    const used = new Set([...Object.keys(values), ...reserved]);
    let i = 1;
    while (used.has(`${prefix}${i}`)) i++;
    const name = `${prefix}${i}`;
    onchange(name, 0);
    renaming = name;
    await tick();
    const input = document.getElementById(`variable-rename-${name}`) as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }
  function rename(from: string, to: string) {
    renaming = null;
    const name = to.trim();
    if (name === from || !NAME.test(name) || Object.hasOwn(values, name) || reserved.includes(name)) return;
    onrename(from, name);
    if (rangeOpen[from]) rangeOpen = { ...rangeOpen, [name]: true };
  }
  function setNumber(name: string, value: unknown, n: number) {
    onchange(name, isRangedVariable(value) ? { ...value, value: n } : n);
  }
  function setRange(name: string, value: unknown, key: 'min' | 'max' | 'step', n: number | undefined) {
    const base: RangedVariable = isRangedVariable(value) ? { ...value } : { value: customNumber(value) ?? 0 };
    if (n === undefined) delete base[key]; else base[key] = n;
    onchange(name, base.min === undefined && base.max === undefined && base.step === undefined ? base.value : base);
  }
  async function copy(name: string) {
    const ref = `${namespace}.${name}`;
    try { await navigator.clipboard.writeText(ref); }
    catch { /* The visible reference remains available in the inspector. */ }
  }
</script>

<Section {title} bind:open>
  {#snippet action()}<div class="section-actions">{#if showInfo}<InfoTip text={info} />{/if}<IconButton icon="plus" label={addLabel} onclick={add} /></div>{/snippet}
  {#each Object.entries(values) as [name, value] (name)}
    {@const expression = isNumericExpression(value) ? value : null}
    {@const expressionError = expression ? validateExpression(expression.$expr) : null}
    {@const ranged = allowRanges && isRangedVariable(value) ? value : null}
    {@const n = customNumber(value) ?? (expression?.fallback ?? 0)}
    <div class="var">
      {#if renaming === name}
        <input id={`variable-rename-${name}`} class="var-rename" value={name} aria-label="Variable name" spellcheck="false"
          onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') rename(name, e.currentTarget.value); else if (e.key === 'Escape') renaming = null; }}
          onblur={(e) => rename(name, e.currentTarget.value)} />
      {:else}
        <button class="var-name" type="button" title={`${namespace}.${name} · click to copy, double-click to rename`} onclick={() => void copy(name)} ondblclick={() => (renaming = name)}>{name}</button>
      {/if}
      <div class="var-control">
        {#if expression}
          <div class="variable-expression" data-invalid={expressionError || undefined}>
            <input class="expression-input" value={expression.$expr} aria-label={`${name} expression`} aria-invalid={expressionError ? 'true' : undefined}
              title={expressionError ?? `Use ${namespace} values, props.name, children["id"].property, scene variables, and math functions.`} spellcheck="false"
              oninput={(e) => onchange(name, { ...expression, $expr: e.currentTarget.value })}
              use:formulaField={{ label: name, commit: (next) => onchange(name, { ...expression, $expr: next }) }}
              onkeydown={(e) => e.stopPropagation()} />
            <button class="expression-toggle" type="button" aria-label={`Use a number for ${name}`} title="Switch to a number" onclick={() => onchange(name, expression.fallback)}>ƒx</button>
            {#if expressionError}<span class="expression-error" role="status">{expressionError}</span>{/if}
          </div>
        {:else}
          <NumberField value={n} step={ranged?.step ?? 0.1} min={ranged?.min} max={ranged?.max} width="72px" label={`${name} value`}
            trailingAction={{ label: `Use an expression for ${name}`, title: 'Use an expression with incoming props, child values, scene variables, and math functions', onclick: () => onchange(name, { $expr: String(n), fallback: n }) }}
            onchange={(v) => setNumber(name, value, v)} />
          {#if ranged && ranged.min !== undefined && ranged.max !== undefined}
            <Slider value={n} min={ranged.min} max={ranged.max} step={ranged.step ?? 0.01} label={name} width="56px" onchange={(v) => setNumber(name, value, v)} />
          {/if}
        {/if}
        <span class="var-actions" data-pinned={rangeOpen[name] || undefined}>
          {#if allowRanges && !expression}<IconButton icon="range" label={rangeOpen[name] ? `Hide ${name} range` : `Set a range for ${name} (slider)`} active={!!rangeOpen[name]} onclick={() => (rangeOpen = { ...rangeOpen, [name]: !rangeOpen[name] })} />{/if}
          <IconButton icon="trash" label={`Remove ${name}`} onclick={() => onremove(name)} />
        </span>
      </div>
    </div>
    {#if rangeOpen[name] && ranged && !expression}
      <div class="var var-range">
        <span class="var-name-spacer" aria-hidden="true"></span>
        <div class="var-control">
          {#each [['min', 'Min'], ['max', 'Max'], ['step', 'Step']] as const as [key, prefixLabel] (key)}
            {@const set = ranged[key] !== undefined}
            <NumberField value={ranged[key] ?? (key === 'step' ? 0.1 : key === 'min' ? Math.min(0, n) : Math.max(1, n))} step={0.1} prefix={prefixLabel} width="58px" label={`${name} ${key}`} error={false}
              trailingAction={set ? { label: `Clear ${name} ${key}`, title: `Clear ${key}`, onclick: () => setRange(name, value, key, undefined) } : undefined}
              onchange={(v) => setRange(name, value, key, v)} />
          {/each}
        </div>
      </div>
    {/if}
  {/each}
</Section>

<style>
  .section-actions { display: inline-flex; align-items: center; gap: var(--sv-space-4); }
  .var { display: flex; flex-direction: column; align-items: stretch; gap: var(--sv-space-2); min-height: var(--sv-size-row); padding: var(--sv-space-4) var(--sv-space-8) var(--sv-space-6); }
  .var-name { flex: none; width: 100%; padding: 0; font: inherit; color: var(--sv-text-secondary); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: none; border: 0; cursor: copy; }
  .var-name:hover { color: var(--sv-text-primary); }
  .var-rename { flex: none; width: 100%; height: 20px; padding: 0 var(--sv-space-4); box-sizing: border-box; font: inherit; color: var(--sv-text-primary); text-align: left; background: var(--sv-surface-field); border: var(--sv-border-1) solid var(--sv-accent-fill); outline: none; }
  .var-control { flex: none; width: 100%; display: flex; align-items: center; gap: var(--sv-space-4); min-width: 0; }
  .var-actions { display: flex; margin-left: auto; visibility: hidden; }
  .var:hover .var-actions, .var:focus-within .var-actions, .var-actions[data-pinned] { visibility: visible; }
  .var-actions :global(.sv-icon-button) { width: 20px; height: 20px; }
  .variable-expression { position: relative; display: flex; flex: 1 1 auto; align-items: center; gap: var(--sv-space-4); height: 20px; min-width: 0; padding: 0 var(--sv-space-6); box-sizing: border-box; background: var(--sv-surface-field); border: var(--sv-border-1) solid var(--sv-rule-default); }
  .variable-expression:focus-within { outline: 1px solid var(--sv-accent-text); outline-offset: 1px; }
  .variable-expression[data-invalid] { border-color: var(--sv-signal-error); }
  .expression-input { flex: 1; min-width: 0; padding: 0; color: var(--sv-text-primary); background: none; border: 0; outline: none; font: inherit; }
  .expression-toggle { flex: none; width: 18px; height: 16px; padding: 0; color: var(--sv-text-muted); background: none; border: 0; font: inherit; font-size: 9px; line-height: 1; cursor: pointer; }
  .expression-toggle:hover { color: var(--sv-accent-text); }
  .expression-error { position: absolute; z-index: 4; top: calc(100% + var(--sv-space-4)); left: 0; width: 100%; padding: var(--sv-space-4) var(--sv-space-6); box-sizing: border-box; color: var(--sv-signal-error); background: var(--sv-surface-panel); border: var(--sv-border-1) solid var(--sv-signal-error); font-size: var(--sv-font-size-11); line-height: 1.3; overflow-wrap: anywhere; }
</style>
