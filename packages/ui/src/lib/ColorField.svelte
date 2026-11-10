<script lang="ts">
  import { Popover } from 'bits-ui';

  interface Props {
    value: string;
    label?: string;
    id?: string;
    onchange?: (value: string) => void;
    /** Colores del documento: aparecen en el desplegable, tras blanco, grises y negro. */
    swatches?: string[];
  }
  let { value = $bindable(), label, id, onchange, swatches = [] }: Props = $props();

  // Muestras fijas: blanco, grises y negro.
  const BASE = ['#ffffff', '#d9d9d9', '#a6a6a6', '#737373', '#404040', '#1a1a1a', '#000000'];
  const docSwatches = $derived([...new Set(swatches.map((c) => c.toLowerCase()))].filter((c) => !BASE.includes(c)).slice(0, 21));
  let open = $state(false);
  let picker = $state<HTMLInputElement>();

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
  <Popover.Root bind:open>
    <Popover.Trigger class="sv-color-swatch" style="background: {value}" aria-label={label ? `${label} swatches` : 'Color swatches'} />
    <Popover.Portal>
      <Popover.Content class="sv-color-popover" side="bottom" align="start" sideOffset={4}>
        <div class="grid" role="listbox" aria-label="Swatches">
          {#each BASE as c (c)}
            <button type="button" class="chip" role="option" aria-selected={c === value} aria-label={c} title={c} style:background={c} onclick={() => { set(c); open = false; }}></button>
          {/each}
        </div>
        {#if docSwatches.length}
          <p class="head">In this document</p>
          <div class="grid" role="listbox" aria-label="Document colors">
            {#each docSwatches as c (c)}
              <button type="button" class="chip" role="option" aria-selected={c === value} aria-label={c} title={c} style:background={c} onclick={() => { set(c); open = false; }}></button>
            {/each}
          </div>
        {/if}
        <button type="button" class="more" onclick={() => { open = false; picker?.click(); }}>Custom…</button>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
  <input bind:this={picker} class="native" type="color" {value} tabindex="-1" aria-hidden="true" oninput={(e) => set(e.currentTarget.value)} />
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
  .sv-color { position: relative; }
  :global(.sv-color-swatch) { flex: none; width: 12px; height: 12px; padding: 0; border: 0; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.15); cursor: pointer; }
  /* El selector nativo, invisible bajo la muestra: «Custom…» lo abre. */
  .native { position: absolute; left: 3px; bottom: 0; width: 12px; height: 1px; padding: 0; border: 0; opacity: 0; pointer-events: none; }
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
  .more { display: block; width: 100%; margin-top: var(--sv-space-8); padding: var(--sv-space-2) 0; font: inherit; color: var(--sv-text-secondary); text-align: left; background: none; border: 0; cursor: pointer; }
  .more:hover { color: var(--sv-text-primary); }
  .hex { flex: 1; min-width: 0; padding: 0; font: inherit; color: var(--sv-text-primary); background: none; border: 0; outline: none; }
</style>
