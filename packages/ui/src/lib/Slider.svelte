<script lang="ts">
  import { Slider } from 'bits-ui';

  interface Props {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    label?: string;
    width?: string;
    onchange?: (value: number) => void;
  }
  let { value = $bindable(), min = 0, max = 1, step = 0.01, label, width = '100px', onchange }: Props = $props();
</script>

<Slider.Root
  type="single"
  bind:value
  {min}
  {max}
  {step}
  onValueChange={(v) => onchange?.(v)}
  class="sv-slider"
  style="width: {width}"
>
  <span class="track"><Slider.Range class="range" /></span>
  <Slider.Thumb index={0} class="thumb" aria-label={label} />
</Slider.Root>

<style>
  :global(.sv-slider) {
    position: relative;
    display: flex;
    align-items: center;
    height: 20px;
    touch-action: none;
    cursor: pointer;
  }
  .track {
    position: relative;
    flex: 1;
    height: 2px;
    background: var(--sv-rule-strong);
  }
  :global(.sv-slider .range) { position: absolute; height: 100%; background: var(--sv-accent-fill); }
  :global(.sv-slider .thumb) {
    display: block;
    width: 6px;
    height: 12px;
    background: var(--sv-text-primary);
    cursor: ew-resize;
  }
  :global(.sv-slider .thumb:focus-visible) { outline: 1px solid var(--sv-accent-fill); outline-offset: 1px; }
</style>
