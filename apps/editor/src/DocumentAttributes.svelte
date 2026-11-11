<script lang="ts">
  // Sin nada seleccionado: el documento. Su tamaño es lo que se exporta y lo que enseña el modo Play.
  import { Button, ColorField, IconButton, NumberField, ParamRow, Section, Segmented, Select } from '@svertik/ui';
  import { DOCUMENT_PALETTE, PALETTES } from '@svertik/engine';
  import type { Editor } from './editor.svelte';

  let { editor }: { editor: Editor } = $props();
  const doc = $derived(editor.scene?.document ?? null);
  const PRESETS: [string, number, number][] = [
    ['16:9 · 1920×1080', 1920, 1080],
    ['1:1 · 1080×1080', 1080, 1080],
    ['4:5 · 1080×1350', 1080, 1350],
    ['9:16 · 1080×1920', 1080, 1920],
    ['Link · 1200×630', 1200, 630],
  ];
  const CUSTOM = 'Custom';
  const preset = $derived(PRESETS.find(([, w, h]) => doc && w === doc.width && h === doc.height)?.[0] ?? CUSTOM);
  // Paletas: la que se ve en el selector de color, aplicarla al dibujo y guardar la del documento.
  const current = $derived(editor.palettes.find((p) => p.name === editor.paletteName));
  const chips = $derived(current?.colors ?? editor.docColors);
  const own = $derived(!!current && !PALETTES.some((p) => p.name === current.name));
  let saving = $state('');
  function save() {
    if (editor.savePalette(saving)) saving = '';
  }
  function setMode(mode: string) {
    if (mode === 'auto') editor.setDocument(null);
    // Al fijarlo, empieza del tamaño de lo dibujado (y centrado en ello): no se corta nada.
    else editor.fitDocument();
  }
</script>

<div class="doc">
  <header><h2>Document</h2><span class="meta">{doc ? 'fixed' : 'auto'}</span></header>
  <Section title="Size">
    <ParamRow label="Size">
      <Segmented value={doc ? 'fixed' : 'auto'} label="Document size" options={[{ value: 'auto', label: 'Auto' }, { value: 'fixed', label: 'Fixed' }]} onchange={setMode} />
    </ParamRow>
    {#if doc}
      <ParamRow label="Preset">
        <Select
          value={preset}
          options={[CUSTOM, ...PRESETS.map(([n]) => n)]}
          label="Size preset"
          width="132px"
          onchange={(v) => {
            const p = PRESETS.find(([n]) => n === v);
            if (p) editor.setDocument({ width: p[1], height: p[2] });
          }}
        />
      </ParamRow>
      <ParamRow label="Width" for="doc-w">
        <NumberField id="doc-w" value={doc.width} min={1} step={1} unit="px" onchange={(v) => editor.setDocument({ width: v, height: doc.height }, false)} />
      </ParamRow>
      <ParamRow label="Height" for="doc-h">
        <NumberField id="doc-h" value={doc.height} min={1} step={1} unit="px" onchange={(v) => editor.setDocument({ width: doc.width, height: v }, false)} />
      </ParamRow>
      <div class="actions"><Button label="Fit to drawing" onclick={() => editor.fitDocument()} /></div>
    {/if}
    <p class="note">
      {doc
        ? 'What is exported and shown in Play. Anything outside is cut off. Turn on Bounds (View, below) to see the edge.'
        : 'The document fits whatever is drawn, with a small margin. Fix a size to export a frame (a video size, a post…).'}
    </p>
  </Section>
  <Section title="Canvas">
    <ParamRow label="Color">
      <ColorField value={editor.canvas || '#0b0b0b'} label="Canvas color" swatches={editor.docColors} onchange={(v) => editor.setCanvas(v)} />
      {#if editor.canvas}<IconButton icon="undo" label="Default canvas color" onclick={() => editor.setCanvas('')} />{/if}
    </ParamRow>
    <p class="note">The color behind the drawing, in the editor and in Play. It is not exported: the SVG stays transparent.</p>
  </Section>
  <Section title="Palette">
    <ParamRow label="Palette">
      <Select
        value={editor.paletteName}
        options={[DOCUMENT_PALETTE, ...editor.palettes.map((p) => p.name)]}
        label="Palette"
        width="132px"
        onchange={(v) => editor.selectPalette(v)}
      />
      {#if own}<IconButton icon="trash" label="Delete this palette" onclick={() => current && editor.deletePalette(current.name)} />{/if}
    </ParamRow>
    {#if chips.length}
      <div class="chips" aria-label="Palette colors">
        {#each chips as c (c)}<span class="chip" title={c} style:background={c}></span>{/each}
      </div>
    {/if}
    {#if current}
      <div class="actions"><Button label="Apply to drawing" title="Change the drawing's colors to this palette's, darkest to darkest and lightest to lightest" onclick={() => editor.applyPalette(current.name)} /></div>
    {/if}
    <ParamRow label="Save as">
      <input
        class="name"
        placeholder="Palette name"
        aria-label="New palette name"
        spellcheck="false"
        bind:value={saving}
        onkeydown={(e) => e.key === 'Enter' && save()}
      />
      <Button label="Save" disabled={!saving.trim() || !editor.docColors.length} onclick={save} />
    </ParamRow>
    <p class="note">The chosen palette shows in every color picker. Save keeps this document's colors as a palette of your own, in this browser.</p>
  </Section>
  <p class="hint">Select an object or a modifier to edit it. Drop more SVGs to add objects.</p>
</div>

<style>
  header { display: flex; align-items: center; gap: var(--sv-space-8); height: 28px; padding: 0 var(--sv-space-8); }
  h2 { flex: 1; margin: 0; font-size: var(--sv-font-size-11); }
  .meta { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .actions { display: flex; gap: var(--sv-space-8); padding: var(--sv-space-4) var(--sv-space-8); }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; padding: var(--sv-space-4) var(--sv-space-8) var(--sv-space-4) 100px; }
  .chip { width: 14px; height: 14px; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.15); }
  .name {
    width: 96px;
    height: 20px;
    padding: 0 var(--sv-space-6);
    font: inherit;
    color: var(--sv-text-primary);
    background: var(--sv-surface-field);
    border: var(--sv-border-1) solid var(--sv-rule-default);
    outline: none;
    box-sizing: border-box;
  }
  .name:focus { border-color: var(--sv-accent-fill); }
  .note, .hint { margin: var(--sv-space-8); color: var(--sv-text-muted); font-size: var(--sv-font-size-10); line-height: 1.5; }
</style>
