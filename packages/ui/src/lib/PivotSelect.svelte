<script lang="ts">
  import { t } from './i18n';
  interface Props {
    value: string;
    label: string;
    onchange: (value: string) => void;
  }
  let { value, label, onchange }: Props = $props();

  const positions = [
    { value: 'nw', glyph: '↖', label: t('Northwest') },
    { value: 'n', glyph: '↑', label: t('North') },
    { value: 'ne', glyph: '↗', label: t('Northeast') },
    { value: 'w', glyph: '←', label: t('West') },
    { value: 'center', glyph: '⊙', label: t('Center') },
    { value: 'e', glyph: '→', label: t('East') },
    { value: 'sw', glyph: '↙', label: t('Southwest') },
    { value: 's', glyph: '↓', label: t('South') },
    { value: 'se', glyph: '↘', label: t('Southeast') },
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
  .pivot-cell[aria-pressed='true'] { color: var(--sv-accent-text); background: var(--sv-surface-raised); }
  .pivot-cell.center { font-size: 17px; }
</style>
