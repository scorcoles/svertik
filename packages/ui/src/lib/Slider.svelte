<script lang="ts">
  import { Slider } from 'bits-ui';

  interface Props {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    curve?: 'linear' | 'quadratic';
    label?: string;
    width?: string;
    onchange?: (value: number) => void;
  }
  let { value = $bindable(), min = 0, max = 1, step = 0.01, curve = 'linear', label, width = '100px', onchange }: Props = $props();
  const sliderValue = $derived(curve === 'quadratic'
    ? Math.sqrt(Math.max(0, Math.min(1, (value - min) / Math.max(1e-12, max - min))))
    : value);
</script>

<!-- Solo avisa de cambios del usuario: si el valor llega de fuera (animación, otro campo) y el
     deslizador solo lo redondea a su paso, no es un cambio (si no, la animación grabaría claves sola). -->
<Slider.Root
  type="single"
  value={sliderValue}
  min={curve === 'quadratic' ? 0 : min}
  max={curve === 'quadratic' ? 1 : max}
  step={curve === 'quadratic' ? 0.001 : step}
  onValueChange={(v) => {
    const next = curve === 'quadratic' ? min + (max - min) * v * v : v;
    if (Math.abs(next - value) <= (curve === 'quadratic' ? 1e-9 : step / 2 + 1e-9)) return;
    value = next;
    onchange?.(next);
  }}
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
