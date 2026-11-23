<script lang="ts">
  interface Props {
    value: string;
    label: string;
    onchange: (value: string) => void;
  }
  let { value, label, onchange }: Props = $props();

  const positions = [
    { value: 'nw', glyph: '↖', label: 'Northwest' },
    { value: 'n', glyph: '↑', label: 'North' },
    { value: 'ne', glyph: '↗', label: 'Northeast' },
    { value: 'w', glyph: '←', label: 'West' },
    { value: 'center', glyph: '⊙', label: 'Center' },
    { value: 'e', glyph: '→', label: 'East' },
    { value: 'sw', glyph: '↙', label: 'Southwest' },
    { value: 's', glyph: '↓', label: 'South' },
    { value: 'se', glyph: '↘', label: 'Southeast' },
  ];
</script>

<div class="pivot-grid" role="group" aria-label={label}>
  {#each positions as position (position.value)}
    <button
      type="button"
      class="pivot-cell"
      class:center={position.value === 'center'}
      aria-label={`${label}: ${position.label}`}
      aria-pressed={value === position.value}
      title={position.label}
      onclick={() => onchange(position.value)}
    >{position.glyph}</button>
  {/each}
</div>

<style>
  .pivot-grid {
    display: grid;
    grid-template-columns: repeat(3, 24px);
    grid-template-rows: repeat(3, 22px);
    gap: 1px;
    padding: 1px;
    background: var(--sv-rule-default);
    border: var(--sv-border-1) solid var(--sv-rule-default);
  }
  .pivot-cell {
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: var(--sv-radius-none);
    color: var(--sv-text-muted);
    background: var(--sv-surface-field);
    font: inherit;
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
  }
  .pivot-cell:hover { color: var(--sv-text-primary); background: var(--sv-surface-raised); }
  .pivot-cell[aria-pressed='true'] { color: var(--sv-accent-fill); background: var(--sv-surface-raised); }
  .pivot-cell.center { font-size: 17px; }
</style>
