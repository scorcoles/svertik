<script lang="ts">
  import PaintField from '../lib/PaintField.svelte';

  let solid = $state('#09fdd1');
  let linear = $state({
    kind: 'linear' as const,
    stops: [
      { offset: 0, color: '#09fdd1' },
      { offset: 1, color: '#5c3cff' },
    ],
    x1: 0, y1: 0.5, x2: 1, y2: 0.5,
  });
  let radial = $state({
    kind: 'radial' as const,
    stops: [
      { offset: 0, color: '#ffffff' },
      { offset: 1, color: '#ff6b5e' },
    ],
    cx: 0.5, cy: 0.5, r: 0.5,
  });
  const swatches = ['#09fdd1', '#ff6b5e', '#5c3cff', '#ededed'];
</script>

<div style="display:grid; gap:12px; padding: 8px;">
  <div style="display:grid; gap:4px;">
    <div style="color:var(--sv-text-secondary); font-size:var(--sv-font-size-10);">Solid</div>
    <PaintField label="Fill" bind:value={solid} {swatches} />
  </div>
  <div style="display:grid; gap:4px;">
    <div style="color:var(--sv-text-secondary); font-size:var(--sv-font-size-10);">Linear gradient</div>
    <PaintField label="Fill" bind:value={linear} {swatches} />
  </div>
  <div style="display:grid; gap:4px;">
    <div style="color:var(--sv-text-secondary); font-size:var(--sv-font-size-10);">Radial gradient</div>
    <PaintField label="Fill" bind:value={radial} {swatches} />
  </div>
</div>
