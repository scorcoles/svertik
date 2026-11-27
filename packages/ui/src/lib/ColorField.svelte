<script lang="ts">
  import { t } from './i18n';
  import { Popover } from 'bits-ui';
  import ColorPicker from './ColorPicker.svelte';
  import { DOCUMENT_PALETTE, usePalettes } from './palettes';
  import { hexPattern, joinHex, normalizeTyped, splitHex, swatchBackground } from './color-hex';

  interface Props {
    value: string;
    label?: string;
    id?: string;
    onchange?: (value: string) => void;
    /** Document colours: they appear in the dropdown, after white, greys and black. */
    swatches?: string[];
    /** Only the swatch, without the hex field (narrow rows, like View). */
    compact?: boolean;
    /** No colour (fill or stroke off): the swatch shows a white square crossed by a red line. */
    none?: boolean;
    /** Offers "None" among the swatches; picking a colour turns it back on (the caller's onchange). */
    onnone?: () => void;
    /** Allows opacity (#rrggbbaa) with a bar and a percentage; off where only #rrggbb fits (palettes). */
    alpha?: boolean;
  }
  let { value = $bindable(), label, id, onchange, swatches = [], compact = false, none = false, onnone, alpha = true }: Props = $props();
  /** The "no colour" look: white, crossed from bottom left to top right by a red line. */
  const NONE_BG = 'linear-gradient(to top right, #fff calc(50% - 1px), #e5484d calc(50% - 0.6px), #e5484d calc(50% + 0.6px), #fff calc(50% + 1px))';

  // Muestras fijas: blanco, grises y negro.
  const BASE = ['#ffffff', '#d9d9d9', '#a6a6a6', '#737373', '#404040', '#1a1a1a', '#000000'];
  const docSwatches = $derived([...new Set(swatches.map((c) => c.toLowerCase()))].filter((c) => !BASE.includes(c)).slice(0, 21));
  // Palettes (if the app provides them): pick which to show; the document's comes first.
  const palettes = usePalettes();
  const shown = $derived.by(() => {
    if (!palettes || palettes.current === DOCUMENT_PALETTE) return { name: DOCUMENT_PALETTE, colors: docSwatches };
    const p = palettes.list.find((x) => x.name === palettes.current);
    return p ? { name: p.name, colors: p.colors.map((c) => c.toLowerCase()).slice(0, 21) } : { name: DOCUMENT_PALETTE, colors: docSwatches };
  });
  let open = $state(false);

  let draft = $state('');
  let editing = $state(false);
  const HEX = $derived(hexPattern(alpha));
  const opacity = $derived(Math.round(splitHex(value).a * 100));

  const set = (v: string) => {
    value = normalizeTyped(v, alpha);
    onchange?.(value);
  };
  /** A swatch keeps the current opacity: picking a colour changes only its hue. */
  const pick = (c: string) => set(alpha ? joinHex(c, splitHex(value).a) : c);
  function setOpacity(input: HTMLInputElement) {
    const n = parseFloat(input.value);
    if (Number.isFinite(n)) set(joinHex(value, Math.max(0, Math.min(100, n)) / 100));
    else input.value = `${opacity}`;
  }
  function commit() {
    if (HEX.test(draft.trim())) set(draft.trim());
    editing = false;
  }
</script>

<div class="sv-color" data-compact={compact || undefined} data-invalid={editing && !HEX.test(draft.trim()) ? '' : undefined}>
  <Popover.Root bind:open>
    <Popover.Trigger class="sv-color-swatch" style="background: {none ? NONE_BG : swatchBackground(value)}" aria-label={label ? `${label} swatches` : t('Color swatches')} title={none ? t('None') : undefined} />
    <Popover.Portal>
      <Popover.Content class="sv-color-popover" side="bottom" align="start" sideOffset={4}>
        <ColorPicker {value} {alpha} width={184} onchange={set} />
        <div class="hex-row">
          <input
            class="hex-in"
            spellcheck="false"
            aria-label={label ? `${label} hex` : 'Hex'}
            value={value.toUpperCase()}
            onchange={(e) => { const v = e.currentTarget.value.trim(); if (HEX.test(v)) set(v); else e.currentTarget.value = value.toUpperCase(); }}
            onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          {#if alpha}<label class="pct">
            <input
              type="text"
              inputmode="decimal"
              spellcheck="false"
              aria-label={label ? t('{label} opacity', { label }) : t('Opacity')}
              value={opacity}
              onchange={(e) => setOpacity(e.currentTarget)}
              onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            /><span aria-hidden="true">%</span>
          </label>{/if}
        </div>
        <div class="grid" role="listbox" aria-label={t('Swatches')}>
          {#each BASE as c (c)}
            <button type="button" class="chip" role="option" aria-selected={!none && c === splitHex(value).rgb} aria-label={c} title={c} style:background={c} onclick={() => pick(c)}></button>
          {/each}
          {#if onnone}<button type="button" class="chip" role="option" aria-selected={none} aria-label={t('None')} title={t('None')} style:background={NONE_BG} onclick={() => { onnone(); open = false; }}></button>{/if}
        </div>
        {#if palettes}
          <select class="pal" aria-label={t('Palette')} value={shown.name} onchange={(e) => palettes.select(e.currentTarget.value)}>
            <option value={DOCUMENT_PALETTE}>{t(DOCUMENT_PALETTE)}</option>
            {#each palettes.list as p (p.name)}<option value={p.name}>{p.name}</option>{/each}
          </select>
        {:else if docSwatches.length}
          <p class="head">{t(DOCUMENT_PALETTE)}</p>
        {/if}
        {#if shown.colors.length}
          <div class="grid" role="listbox" aria-label={shown.name}>
            {#each shown.colors as c (c)}
              <button type="button" class="chip" role="option" aria-selected={c === splitHex(value).rgb} aria-label={c} title={c} style:background={c} onclick={() => pick(c)}></button>
            {/each}
          </div>
        {:else if palettes}
          <p class="empty">{t('No colors yet.')}</p>
        {/if}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
  {#if !compact}<input
    {id}
    class="hex"
    type="text"
    spellcheck="false"
    aria-label={label}
    value={editing ? draft : none ? t('None') : value.toUpperCase()}
    onfocus={(e) => { editing = true; draft = value.toUpperCase(); e.currentTarget.select(); }}
    oninput={(e) => (draft = e.currentTarget.value)}
    onblur={commit}
    onkeydown={(e) => {
      if (e.key === 'Enter') e.currentTarget.blur();
      else if (e.key === 'Escape') { editing = false; e.currentTarget.blur(); }
    }}
  />{/if}
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
  .sv-color[data-compact] { width: auto; padding: 3px; }
  .sv-color[data-invalid] { border-color: var(--sv-signal-error); }
  .sv-color:has(:focus-visible) { outline: 1px solid var(--sv-accent-text); outline-offset: 1px; }
  .sv-color { position: relative; }
  :global(.sv-color-swatch) { flex: none; width: 12px; height: 12px; padding: 0; border: 0; box-shadow: 0 0 0 1px var(--sv-rule-strong), inset 0 0 0 1px var(--sv-overlay-light-soft); cursor: pointer; }
  :global(.sv-color-popover) {
    z-index: 50;
    width: 200px;
    padding: var(--sv-space-6);
    background: var(--sv-surface-panel);
    border: var(--sv-border-1) solid var(--sv-rule-strong);
    font-size: var(--sv-font-size-10);
  }
  .grid { display: grid; grid-template-columns: repeat(8, 18px); gap: 6px; }
  .chip { width: 18px; height: 18px; padding: 0; border: 0; box-shadow: 0 0 0 1px var(--sv-rule-strong), inset 0 0 0 1px var(--sv-overlay-light-soft); cursor: pointer; }
  .chip:hover { outline: 1px solid var(--sv-text-muted); outline-offset: 1px; }
  .chip[aria-selected='true'] { outline: 1px solid var(--sv-accent-text); outline-offset: 1px; }
  .head { margin: var(--sv-space-8) 0 var(--sv-space-4); color: var(--sv-text-muted); }
  .empty { margin: var(--sv-space-4) 0 0; color: var(--sv-text-muted); }
  .pal {
    width: 100%;
    height: 20px;
    margin: var(--sv-space-8) 0 var(--sv-space-6);
    padding: 0 var(--sv-space-4);
    font: inherit;
    color: var(--sv-text-secondary);
    background: var(--sv-surface-field);
    border: var(--sv-border-1) solid var(--sv-rule-default);
    outline: none;
    cursor: pointer;
  }
  .pal:hover { border-color: var(--sv-rule-strong); }
  .pal:focus-visible { border-color: var(--sv-accent-fill); }
  .hex-row { display: flex; gap: var(--sv-space-6); margin: var(--sv-space-6) 0 var(--sv-space-8); }
  .pct {
    display: flex;
    align-items: center;
    flex: none;
    width: 52px;
    height: 20px;
    padding: 0 var(--sv-space-6);
    color: var(--sv-text-muted);
    background: var(--sv-surface-field);
    border: var(--sv-border-1) solid var(--sv-rule-default);
    box-sizing: border-box;
  }
  .pct:focus-within { border-color: var(--sv-accent-fill); }
  .pct input { flex: 1; min-width: 0; padding: 0; font: inherit; color: var(--sv-text-primary); background: none; border: 0; outline: none; text-align: right; }
  .hex-in {
    flex: 1;
    min-width: 0;
    height: 20px;
    padding: 0 var(--sv-space-6);
    font: inherit;
    color: var(--sv-text-primary);
    background: var(--sv-surface-field);
    border: var(--sv-border-1) solid var(--sv-rule-default);
    outline: none;
    box-sizing: border-box;
  }
  .hex-in:focus { border-color: var(--sv-accent-fill); }
  .hex { flex: 1; min-width: 0; padding: 0; font: inherit; color: var(--sv-text-primary); background: none; border: 0; outline: none; }
</style>
