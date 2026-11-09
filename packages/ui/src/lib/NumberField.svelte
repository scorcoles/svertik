<script lang="ts">
  import { clamp, formatNumber, nudge, parseNumber, scrub } from './scrub';

  interface Props {
    value: number;
    step?: number;
    min?: number;
    max?: number;
    unit?: string;
    /** Nombre accesible si no hay <label> asociado. */
    label?: string;
    id?: string;
    width?: string;
    error?: boolean;
    disabled?: boolean;
    onchange?: (value: number) => void;
  }
  let {
    value = $bindable(),
    step = 0.01,
    min,
    max,
    unit = '',
    label,
    id,
    width = '72px',
    error = false,
    disabled = false,
    onchange,
  }: Props = $props();

  let input: HTMLInputElement;
  let editing = $state(false);
  let scrubbing = $state(false);
  let draft = $state('');
  let invalid = $derived(editing && parseNumber(draft) === null);

  const set = (v: number) => {
    const next = clamp(v, min, max);
    if (next === value) return;
    value = next;
    onchange?.(next);
  };

  // Arrastrar en horizontal cambia el valor; un clic sin arrastre entra en edición.
  let startX = 0;
  let startValue = 0;
  let moved = $state(false);
  function pointerdown(e: PointerEvent) {
    if (editing || disabled || e.button !== 0) return;
    e.preventDefault();
    input.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startValue = value;
    moved = false;
    scrubbing = true;
  }
  function pointermove(e: PointerEvent) {
    if (!scrubbing) return;
    const dx = e.clientX - startX;
    if (!moved && Math.abs(dx) < 3) return;
    moved = true;
    set(scrub(startValue, dx, { step, min, max, coarse: e.shiftKey, fine: e.altKey }));
  }
  function pointerup(e: PointerEvent) {
    if (!scrubbing) return;
    scrubbing = false;
    input.releasePointerCapture(e.pointerId);
    if (!moved) startEditing();
  }

  function startEditing() {
    editing = true;
    draft = formatNumber(value, step);
    queueMicrotask(() => {
      input.focus();
      input.select();
    });
  }
  function commit() {
    const v = parseNumber(draft);
    if (v !== null) set(v);
    editing = false;
  }
  function keydown(e: KeyboardEvent) {
    if (editing) {
      if (e.key === 'Enter') { e.preventDefault(); commit(); input.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); editing = false; input.blur(); }
      return;
    }
    const o = { step, min, max, coarse: e.shiftKey, fine: e.altKey };
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); set(nudge(value, 1, o)); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); set(nudge(value, -1, o)); }
    else if (e.key === 'Enter' || /^[\d.,-]$/.test(e.key)) { startEditing(); if (e.key !== 'Enter') { draft = e.key; e.preventDefault(); } }
  }
</script>

<div
  class="sv-field"
  style:width
  data-state={scrubbing && moved ? 'scrub' : error || invalid ? 'error' : editing ? 'edit' : 'idle'}
  data-disabled={disabled || undefined}
>
  <input
    bind:this={input}
    {id}
    type="text"
    inputmode="decimal"
    role="spinbutton"
    aria-label={label}
    aria-valuenow={value}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-invalid={error || invalid || undefined}
    {disabled}
    readonly={!editing}
    value={editing ? draft : formatNumber(value, step)}
    oninput={(e) => (draft = e.currentTarget.value)}
    onpointerdown={pointerdown}
    onpointermove={pointermove}
    onpointerup={pointerup}
    onpointercancel={pointerup}
    onkeydown={keydown}
    onblur={() => editing && commit()}
  />
  {#if unit}<span class="unit" aria-hidden="true">{unit}</span>{/if}
</div>

<style>
  .sv-field {
    display: flex;
    align-items: center;
    gap: var(--sv-space-4);
    height: 20px;
    padding: 0 var(--sv-space-6);
    background: var(--sv-surface-field);
    border: var(--sv-border-1) solid var(--sv-rule-default);
  }
  .sv-field:hover { border-color: var(--sv-rule-strong); }
  .sv-field[data-state='scrub'] { border-color: var(--sv-accent-fill); }
  .sv-field[data-state='edit'] { border-color: var(--sv-text-secondary); }
  .sv-field[data-state='error'] { border-color: var(--sv-signal-error); }
  .sv-field[data-disabled] { opacity: 0.4; }
  .sv-field:has(input:focus-visible) { outline: 1px solid var(--sv-accent-fill); outline-offset: 1px; }
  input {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: 0;
    background: none;
    color: var(--sv-text-primary);
    font: inherit;
    outline: none;
    cursor: ew-resize;
  }
  input:not([readonly]) { cursor: text; }
  .unit { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
</style>
