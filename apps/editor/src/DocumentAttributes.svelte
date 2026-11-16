<script lang="ts">
  // Sin nada seleccionado: el documento. Su tamaño es lo que se exporta y lo que enseña el modo Play.
  import { Button, ColorField, IconButton, NumberField, ParamRow, Section, Segmented, Select } from '@svertik/ui';
  import { DOCUMENT_PALETTE, PALETTES } from '@svertik/engine';
  import { DEFAULT_CANVAS, type Editor } from './editor.svelte';

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
      <div class="dimensions">
        <ParamRow label="Width" for="doc-w">
          <NumberField id="doc-w" value={doc.width} min={1} step={1} unit="px" onchange={(v) => editor.setDocument({ width: v, height: doc.height }, false)} />
        </ParamRow>
        <ParamRow label="Height" for="doc-h">
          <NumberField id="doc-h" value={doc.height} min={1} step={1} unit="px" onchange={(v) => editor.setDocument({ width: doc.width, height: v }, false)} />
        </ParamRow>
        <span class="swap"><IconButton icon="swap" label="Swap document width and height" onclick={() => editor.setDocument({ width: doc.height, height: doc.width })} /></span>
      </div>
      <div class="actions">
        <Button label="Fit to drawing" onclick={() => editor.fitDocument()} />
      </div>
    {/if}
    <p class="note">
      {doc
        ? 'What is exported and shown in Play. Anything outside is cut off. Turn on Bounds (View, below) to see the edge.'
        : 'The document fits whatever is drawn, with a small margin. Fix a size to export a frame (a video size, a post…).'}
    </p>
  </Section>
  <Section title="Randomness">
    <ParamRow label="Seed generator" for="scene-seed-generator">
      <NumberField id="scene-seed-generator" value={editor.seedGenerator} min={0} max={2147483647} step={1} onchange={(v) => editor.setSeedGenerator(v)} />
    </ParamRow>
    <div class="actions">
      <Button label="Link all seeds" title="Link numeric effect seeds to this generator, preserving their current differences" onclick={() => editor.linkSeedsToGenerator()} />
    </div>
    <p class="note">Linked effect seeds vary together while keeping their relative offsets. In the poster demo, changing this seed also rebuilds its layout.</p>
  </Section>
  <Section title="Canvas">
    <ParamRow label="Background">
      <ColorField value={editor.canvas || DEFAULT_CANVAS} label="Canvas background" swatches={editor.docColors} onchange={(v) => editor.setCanvas(v)} />
      {#if editor.canvas}<Button label="Reset" title="Use the default canvas background" onclick={() => editor.setCanvas('')} />{/if}
    </ParamRow>
    <p class="note">For viewing only; it is not included in the exported SVG.</p>
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
  .dimensions { position: relative; }
  .swap { position: absolute; left: 176px; top: 50%; translate: 0 -50%; display: flex; }
  .actions { display: flex; justify-content: center; gap: var(--sv-space-8); padding: var(--sv-space-12) var(--sv-space-8) var(--sv-space-4); }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; padding: var(--sv-space-4) var(--sv-space-8) var(--sv-space-4) 100px; }
  .chip { width: 14px; height: 14px; box-shadow: 0 0 0 1px var(--sv-rule-strong), inset 0 0 0 1px var(--sv-overlay-light-soft); }
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
  .note, .hint { margin: var(--sv-space-8); color: var(--sv-text-muted); font-size: var(--sv-font-size-11); line-height: 1.5; }
</style>
