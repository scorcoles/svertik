<script lang="ts">
  import { Popover } from 'bits-ui';
  import ColorPicker from './ColorPicker.svelte';
  import { DOCUMENT_PALETTE, usePalettes } from './palettes';

  interface Props {
    value: string;
    label?: string;
    id?: string;
    onchange?: (value: string) => void;
    /** Colores del documento: aparecen en el desplegable, tras blanco, grises y negro. */
    swatches?: string[];
    /** Solo la muestra, sin el campo hex (filas estrechas, como View). */
    compact?: boolean;
  }
  let { value = $bindable(), label, id, onchange, swatches = [], compact = false }: Props = $props();

  // Muestras fijas: blanco, grises y negro.
  const BASE = ['#ffffff', '#d9d9d9', '#a6a6a6', '#737373', '#404040', '#1a1a1a', '#000000'];
  const docSwatches = $derived([...new Set(swatches.map((c) => c.toLowerCase()))].filter((c) => !BASE.includes(c)).slice(0, 21));
  // Paletas (si la app las da): se elige cuál ver; la del documento, la primera.
  const palettes = usePalettes();
  const shown = $derived.by(() => {
    if (!palettes || palettes.current === DOCUMENT_PALETTE) return { name: DOCUMENT_PALETTE, colors: docSwatches };
    const p = palettes.list.find((x) => x.name === palettes.current);
    return p ? { name: p.name, colors: p.colors.map((c) => c.toLowerCase()).slice(0, 21) } : { name: DOCUMENT_PALETTE, colors: docSwatches };
  });
  let open = $state(false);

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

<div class="sv-color" data-compact={compact || undefined} data-invalid={editing && !HEX.test(draft.trim()) ? '' : undefined}>
  <Popover.Root bind:open>
    <Popover.Trigger class="sv-color-swatch" style="background: {value}" aria-label={label ? `${label} swatches` : 'Color swatches'} />
    <Popover.Portal>
      <Popover.Content class="sv-color-popover" side="bottom" align="start" sideOffset={4}>
        <ColorPicker {value} onchange={set} />
        <input
          class="hex-in"
          spellcheck="false"
          aria-label={label ? `${label} hex` : 'Hex'}
          value={value.toUpperCase()}
          onchange={(e) => { const v = e.currentTarget.value.trim(); if (HEX.test(v)) set(v); else e.currentTarget.value = value.toUpperCase(); }}
          onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <div class="grid" role="listbox" aria-label="Swatches">
          {#each BASE as c (c)}
            <button type="button" class="chip" role="option" aria-selected={c === value} aria-label={c} title={c} style:background={c} onclick={() => set(c)}></button>
          {/each}
        </div>
        {#if palettes}
          <select class="pal" aria-label="Palette" value={shown.name} onchange={(e) => palettes.select(e.currentTarget.value)}>
            <option value={DOCUMENT_PALETTE}>{DOCUMENT_PALETTE}</option>
            {#each palettes.list as p (p.name)}<option value={p.name}>{p.name}</option>{/each}
          </select>
        {:else if docSwatches.length}
          <p class="head">{DOCUMENT_PALETTE}</p>
        {/if}
        {#if shown.colors.length}
          <div class="grid" role="listbox" aria-label={shown.name}>
            {#each shown.colors as c (c)}
              <button type="button" class="chip" role="option" aria-selected={c === value} aria-label={c} title={c} style:background={c} onclick={() => set(c)}></button>
            {/each}
          </div>
        {:else if palettes}
          <p class="empty">No colors yet.</p>
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
    value={editing ? draft : value.toUpperCase()}
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
  .sv-color:has(:focus-visible) { outline: 1px solid var(--sv-accent-fill); outline-offset: 1px; }
  .sv-color { position: relative; }
  :global(.sv-color-swatch) { flex: none; width: 12px; height: 12px; padding: 0; border: 0; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.15); cursor: pointer; }
  :global(.sv-color-popover) {
    z-index: 50;
    width: 148px;
    padding: var(--sv-space-6);
    background: var(--sv-surface-panel);
    border: var(--sv-border-1) solid var(--sv-rule-strong);
    font-size: var(--sv-font-size-10);
  }
  .grid { display: grid; grid-template-columns: repeat(7, 16px); gap: 4px; }
  .chip { width: 16px; height: 16px; padding: 0; border: 0; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.15); cursor: pointer; }
  .chip:hover { outline: 1px solid var(--sv-text-muted); outline-offset: 1px; }
  .chip[aria-selected='true'] { outline: 1px solid var(--sv-accent-fill); outline-offset: 1px; }
  .head { margin: var(--sv-space-8) 0 var(--sv-space-4); color: var(--sv-text-muted); }
  .empty { margin: var(--sv-space-4) 0 0; color: var(--sv-text-disabled); }
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
  .hex-in {
    width: 100%;
    height: 20px;
    margin: var(--sv-space-6) 0 var(--sv-space-8);
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
