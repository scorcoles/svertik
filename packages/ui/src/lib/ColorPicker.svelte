<script lang="ts">
  import { t } from './i18n';
  import { untrack } from 'svelte';
  // A custom colour picker: a saturation (horizontal) and brightness (vertical) square plus a hue bar.
  // Works in HSV and returns hex (#rrggbb).
  interface Props {
    value: string;
    width?: number;
    onchange?: (value: string) => void;
  }
  let { value, width = 180, onchange }: Props = $props();
  const EyeDropperAPI = typeof window === 'undefined'
    ? undefined
    : (window as Window & { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;

  // Hue is kept apart: in greys (s = 0) or black (v = 0) the hex does not keep it.
  let hsv = $state(untrack(() => toHsv(value)));
  let last = untrack(() => value);
  $effect(() => {
    if (value !== last) {
      const next = toHsv(value);
      hsv = next.s === 0 || next.v === 0 ? { ...next, h: hsv.h } : next;
      last = value;
    }
  });
  const emit = () => {
    last = toHex(hsv);
    onchange?.(last);
  };

  function drag(e: PointerEvent, set: (fx: number, fy: number) => void) {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const at = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      set(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)));
      emit();
    };
    at(e);
    const up = () => { el.removeEventListener('pointermove', at); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', at);
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  function keys(e: KeyboardEvent, kind: 'sv' | 'hue') {
    const k = e.shiftKey ? 0.1 : 0.01;
    const d = { ArrowLeft: [-k, 0], ArrowRight: [k, 0], ArrowUp: [0, k], ArrowDown: [0, -k] }[e.key];
    if (!d) return;
    e.preventDefault();
    const c = (n: number) => Math.max(0, Math.min(1, n));
    if (kind === 'hue') hsv = { ...hsv, h: (hsv.h + (d[0]! || d[1]!) * 360 + 360) % 360 };
    else hsv = { ...hsv, s: c(hsv.s + d[0]!), v: c(hsv.v + d[1]!) };
    emit();
  }

  function toHsv(hex: string) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
    const digits = m?.[1]?.length === 3 ? [...m[1]].map((x) => x + x).join('') : m?.[1];
    const n = digits ? parseInt(digits, 16) : 0;
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255) as [number, number, number];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
  }
  function toHex({ h, s, v }: { h: number; s: number; v: number }) {
    const f = (n: number) => {
      const k = (n + h / 60) % 6;
      return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
    };
    return `#${[f(5), f(3), f(1)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  }
  async function pickFromScreen() {
    if (!EyeDropperAPI) return;
    try {
      const { sRGBHex } = await new EyeDropperAPI().open();
      hsv = toHsv(sRGBHex);
      last = sRGBHex.toLowerCase();
      onchange?.(last);
    } catch (error) {
      if (error instanceof DOMException && error.name !== 'AbortError') throw error;
    }
  }
</script>

<div class="picker" style:width="{width}px">
  <div
    class="sv"
    role="slider"
    tabindex="0"
    aria-label={t('Saturation and brightness')}
    aria-valuetext={`saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
    aria-valuenow={Math.round(hsv.v * 100)}
    style:background-color="hsl({hsv.h} 100% 50%)"
    onpointerdown={(e) => drag(e, (fx, fy) => (hsv = { ...hsv, s: fx, v: 1 - fy }))}
    onkeydown={(e) => keys(e, 'sv')}
  >
    <span class="thumb" style:left="{hsv.s * 100}%" style:top="{(1 - hsv.v) * 100}%" style:background={toHex(hsv)}></span>
  </div>
  <div
    class="hue"
    role="slider"
    tabindex="0"
    aria-label={t('Hue')}
    aria-valuemin={0}
    aria-valuemax={360}
    aria-valuenow={Math.round(hsv.h)}
    onpointerdown={(e) => drag(e, (fx) => (hsv = { ...hsv, h: fx * 360 }))}
    onkeydown={(e) => keys(e, 'hue')}
  >
    <span class="thumb bar" style:left="{(hsv.h / 360) * 100}%" style:background="hsl({hsv.h} 100% 50%)"></span>
  </div>
  {#if EyeDropperAPI}
    <button class="eyedropper" type="button" onclick={() => void pickFromScreen()} aria-label={t('Pick a color from the screen')} title={t('Pick a color from the screen')}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10.9 1.8 3.3 3.3-2 2-1-1-5.9 5.9-2.5.5.5-2.5 5.9-5.9-1-1 2.7-1.3ZM3.5 12.5l-1 1" /></svg>
      <span>{t('Pick from screen')}</span>
    </button>
  {/if}
</div>

<style>
  .picker { display: grid; gap: var(--sv-space-6); }
  .sv {
    position: relative;
    height: 112px;
    background-image: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent);
    cursor: crosshair;
    touch-action: none;
  }
  .hue {
    position: relative;
    height: 10px;
    background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
    cursor: ew-resize;
    touch-action: none;
  }
  .sv:focus-visible,
  .hue:focus-visible { outline: 1px solid var(--sv-accent-text); outline-offset: 2px; }
  .thumb {
    position: absolute;
    width: 10px;
    height: 10px;
    translate: -50% -50%;
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow: 0 0 0 1px var(--sv-overlay-ink);
    pointer-events: none;
  }
  .thumb.bar { top: 50%; width: 6px; height: 14px; border-radius: 0; }
  .eyedropper {
    display: flex;
    align-items: center;
    gap: var(--sv-space-6);
    height: 24px;
    padding: 0 var(--sv-space-6);
    color: var(--sv-text-secondary);
    background: var(--sv-surface-field);
    border: var(--sv-border-1) solid var(--sv-rule-default);
    font: inherit;
    cursor: pointer;
  }
  .eyedropper:hover { color: var(--sv-text-primary); border-color: var(--sv-accent-fill); }
  .eyedropper svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: square; stroke-linejoin: miter; }
</style>
