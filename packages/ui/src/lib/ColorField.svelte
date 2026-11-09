<script lang="ts">
  interface Props {
    value: string;
    label?: string;
    id?: string;
    onchange?: (value: string) => void;
  }
  let { value = $bindable(), label, id, onchange }: Props = $props();

  let draft = $state('');
  let editing = $state(false);
  const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

  const set = (v: string) => {
    const hex = v.startsWith('#') ? v : `#${v}`;
    value = hex.toLowerCase();
    onchange?.(value);
  };
  function commit() {
    if (HEX.test(draft.trim())) set(draft.trim());
    editing = false;
  }
</script>

<div class="sv-color" data-invalid={editing && !HEX.test(draft.trim()) ? '' : undefined}>
  <label class="swatch" style:background={value}>
    <input type="color" {value} aria-label={label ? `${label} picker` : 'Color picker'} oninput={(e) => set(e.currentTarget.value)} />
  </label>
  <input
    {id}
    class="hex"
    type="text"
    spellcheck="false"
    aria-label={label}
    value={editing ? draft : value.toUpperCase()}
    onfocus={(e) => { editing = true; draft = value.toUpperCase(); e.currentTarget.select(); }}
    oninput={(e) => (draft = e.currentTarget.value)}
    onblur={commit}
    onkeydown={(e) => {
      if (e.key === 'Enter') e.currentTarget.blur();
      else if (e.key === 'Escape') { editing = false; e.currentTarget.blur(); }
    }}
  />
</div>

<style>
  .sv-color {
    display: flex;
    align-items: center;
    gap: var(--sv-space-6);
    width: 96px;
    height: 20px;
    padding: 0 var(--sv-space-6) 0 3px;
    background: var(--sv-surface-field);
    border: var(--sv-border-1) solid var(--sv-rule-default);
  }
  .sv-color:hover { border-color: var(--sv-rule-strong); }
  .sv-color[data-invalid] { border-color: var(--sv-signal-error); }
  .sv-color:has(:focus-visible) { outline: 1px solid var(--sv-accent-fill); outline-offset: 1px; }
  .swatch { position: relative; flex: none; width: 12px; height: 12px; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.15); cursor: pointer; }
  .swatch input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
  .hex { flex: 1; min-width: 0; padding: 0; font: inherit; color: var(--sv-text-primary); background: none; border: 0; outline: none; }
</style>
