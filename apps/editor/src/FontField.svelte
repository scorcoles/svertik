<script lang="ts">
  // Fuente de un texto: familia (buscador sobre el catálogo libre de Fontsource, cada nombre en su
  // letra), peso (solo los que tiene la familia) y cursiva (si la tiene). Se baja al elegirla.
  import { Popover } from 'bits-ui';
  import { fontKey, hasFont, type ShapeNode } from '@svertik/engine';
  import { Checkbox, ParamRow, Select } from '@svertik/ui';
  import { loadCatalog, nearest, previewFamily, type CatalogFont } from './fonts';
  import type { Editor } from './editor.svelte';

  let { editor, node }: { editor: Editor; node: ShapeNode } = $props();

  let catalog = $state<CatalogFont[] | null>(null);
  $effect(() => {
    void loadCatalog().then((c) => (catalog = c));
  });

  const family = $derived(String(node.params.font ?? 'JetBrains Mono'));
  const weight = $derived(Number(node.params.weight ?? 400));
  const italic = $derived(!!node.params.italic);
  const entry = $derived(catalog?.find((f) => f.family === family) ?? null);
  const NAMES: Record<number, string> = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
  const label = (w: number) => `${w} ${NAMES[w] ?? ''}`.trim();
  const weights = $derived(entry?.weights ?? [400, 700]);

  function choose(f: CatalogFont) {
    const fit = nearest(f, weight, italic);
    editor.setShapeParam(node.id, 'font', f.family);
    if (fit.weight !== weight) editor.setShapeParam(node.id, 'weight', fit.weight);
    if (fit.italic !== italic) editor.setShapeParam(node.id, 'italic', fit.italic);
    open = false;
  }

  // ── Buscador
  let open = $state(false);
  let query = $state('');
  // Por defecto, la selección propia; al buscar, en todo el catálogo (ordenado por popularidad).
  let category = $state<'picks' | 'all' | CatalogFont['category']>('picks');
  const CATEGORIES: [typeof category, string][] = [['picks', 'Picks'], ['all', 'All'], ['sans', 'Sans'], ['serif', 'Serif'], ['display', 'Display'], ['hand', 'Hand'], ['mono', 'Mono']];
  const LIMIT = 120;
  const matches = $derived.by(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    const cat = category === 'picks' && q ? 'all' : category;
    return catalog.filter((f) => (cat === 'all' || (cat === 'picks' ? f.pick : f.category === cat)) && (!q || f.family.toLowerCase().includes(q)));
  });
  // Cada nombre, en su letra: la vista previa se pide cuando la fila se ve.
  let shown = $state<Record<string, string>>({});
  function preview(el: HTMLElement, fam: string) {
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      shown = { ...shown, [fam]: previewFamily(fam) };
      io.disconnect();
    });
    io.observe(el);
    return { destroy: () => io.disconnect() };
  }
  const loading = $derived(editor.fontsTick >= 0 && !hasFont(fontKey(family, weight, italic)));
</script>

<ParamRow label="Font">
  <Popover.Root bind:open>
    <Popover.Trigger class="sv-font-trigger" aria-label="Font: {family}" title={family}>
      <span class="name" style:font-family={shown[family] ? `'${shown[family]}', monospace` : undefined} use:preview={family}>{family}</span>
      <span class="caret" aria-hidden="true">▾</span>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content class="sv-menu sv-font-menu" align="end" sideOffset={4} collisionPadding={8}>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="search"
          type="search"
          placeholder={catalog ? `Search ${catalog.length} free fonts` : 'Loading fonts…'}
          aria-label="Search fonts"
          spellcheck="false"
          autofocus
          bind:value={query}
          onkeydown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && matches[0]) choose(matches[0]);
          }}
        />
        <div class="cats" role="radiogroup" aria-label="Category">
          {#each CATEGORIES as [value, name] (value)}
            <button type="button" role="radio" aria-checked={category === value} onclick={() => (category = value)}>{name}</button>
          {/each}
        </div>
        <div class="list" role="listbox" aria-label="Fonts">
          {#each matches.slice(0, LIMIT) as f (f.family)}
            <button
              type="button"
              role="option"
              aria-selected={f.family === family}
              class="font"
              onclick={() => choose(f)}
              use:preview={f.family}
              style:font-family={shown[f.family] ? `'${shown[f.family]}', monospace` : undefined}
            >{f.family}</button>
          {/each}
          {#if matches.length > LIMIT}<p class="more">{matches.length - LIMIT} more: type to narrow it down</p>{/if}
          {#if catalog && !matches.length}<p class="more">No font matches “{query}”</p>{/if}
        </div>
        <p class="foot">{category === 'picks' && !query ? 'A short, varied selection. ' : 'Most popular first. '}Free fonts from Fontsource, downloaded when used.</p>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
</ParamRow>
<ParamRow label="Weight">
  <Select
    value={label(weight)}
    options={weights.map(label)}
    label="Weight"
    onchange={(v) => editor.setShapeParam(node.id, 'weight', Number(String(v).split(' ')[0]))}
  />
</ParamRow>
<ParamRow label="Italic">
  <Checkbox checked={italic} label="Italic" disabled={!!entry && !entry.italic} onchange={(v) => editor.setShapeParam(node.id, 'italic', v)} />
  {#if entry && !entry.italic}<span class="dim">this family has no italic</span>{/if}
</ParamRow>
{#if loading}<p class="warn">Loading “{family}”… (drawn with JetBrains Mono until it arrives)</p>{/if}

<style>
  :global(.sv-font-trigger) {
    display: flex;
    align-items: center;
    gap: var(--sv-space-6);
    width: 132px;
    height: var(--sv-size-row);
    padding: 0 var(--sv-space-6);
    font: inherit;
    color: var(--sv-text-primary);
    background: var(--sv-surface-field);
    border: var(--sv-border-1) solid var(--sv-rule-default);
    cursor: pointer;
  }
  :global(.sv-font-trigger:hover) { border-color: var(--sv-rule-strong); }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; font-size: 12px; }
  .caret { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  :global(.sv-menu.sv-font-menu) { width: 260px; display: flex; flex-direction: column; padding: 0; overflow: hidden; }
  .search { margin: var(--sv-space-8); padding: var(--sv-space-4) var(--sv-space-6); font: inherit; color: var(--sv-text-primary); background: var(--sv-surface-field); border: var(--sv-border-1) solid var(--sv-rule-default); }
  .search:focus { outline: 1px solid var(--sv-accent-fill); outline-offset: -1px; }
  .cats { display: flex; flex-wrap: wrap; gap: 2px; padding: 0 var(--sv-space-8) var(--sv-space-6); }
  .cats button { padding: 1px var(--sv-space-6); font: inherit; font-size: var(--sv-font-size-10); color: var(--sv-text-secondary); background: none; border: var(--sv-border-1) solid var(--sv-rule-default); cursor: pointer; }
  .cats button[aria-checked='true'] { color: var(--sv-accent-fill); border-color: var(--sv-accent-fill); }
  .list { max-height: 320px; overflow-y: auto; overscroll-behavior: contain; border-top: var(--sv-border-1) solid var(--sv-rule-default); }
  .font { display: block; width: 100%; padding: var(--sv-space-6) var(--sv-space-8); font-size: 15px; line-height: 1.2; color: var(--sv-text-primary); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: none; border: 0; cursor: pointer; }
  .font:hover, .font:focus-visible { background: var(--sv-surface-hover); outline: none; }
  .font[aria-selected='true'] { color: var(--sv-accent-fill); }
  .more, .foot { margin: 0; padding: var(--sv-space-6) var(--sv-space-8); color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .foot { border-top: var(--sv-border-1) solid var(--sv-rule-default); }
  .dim { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .warn { margin: var(--sv-space-4) var(--sv-space-8); color: var(--sv-signal-warning, #ffd166); font-size: var(--sv-font-size-10); }
</style>
