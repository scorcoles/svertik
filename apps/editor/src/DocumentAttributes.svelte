<script lang="ts">
  // Sin nada seleccionado: el documento. Su tamaño es lo que se exporta y lo que enseña el modo Play.
  import { Button, ColorField, IconButton, NumberField, ParamRow, Section, Segmented, Select } from '@svertik/ui';
  import { DOCUMENT_PALETTE, PALETTES, isNumericExpression, validateExpression, type NumericExpression } from '@svertik/engine';
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
  let variableName = $state('');
  let sectionOpen = $state({ size: true, seed: true, canvas: true, palette: true });
  const custom = $derived(editor.scene?.custom ?? {});
  const validVariableName = $derived(/^[A-Za-z_][A-Za-z_0-9]*$/.test(variableName.trim()) && !Object.hasOwn(custom, variableName.trim()));
  function save() {
    if (editor.savePalette(saving)) saving = '';
  }
  function setMode(mode: string) {
    if (mode === 'auto') editor.setDocument(null);
    // Al fijarlo, empieza del tamaño de lo dibujado (y centrado en ello): no se corta nada.
    else editor.fitDocument();
  }
  function addVariable() {
    const name = variableName.trim();
    if (!validVariableName) return;
    editor.setCustomVariables({ ...custom, [name]: 0 });
    variableName = '';
  }
  function setVariable(name: string, value: number | NumericExpression) {
    editor.setCustomVariables({ ...custom, [name]: value });
  }
  function removeVariable(name: string) {
    const next = { ...custom };
    delete next[name];
    editor.setCustomVariables(Object.keys(next).length ? next : null);
  }
  function setAllSections(open: boolean) {
    sectionOpen = { size: open, seed: open, canvas: open, palette: open };
  }
</script>

<div class="doc">
  <header>
    <h2>Document</h2><span class="meta">{doc ? 'fixed' : 'auto'}</span><span class="spacer" aria-hidden="true"></span>
    <IconButton icon="expand-all" label="Expand all document sections" onclick={() => setAllSections(true)} />
    <IconButton icon="collapse-all" label="Collapse all document sections" onclick={() => setAllSections(false)} />
  </header>
  <Section title="Size" bind:open={sectionOpen.size}>
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
    {#if editor.showInfo}<p class="note">
      {doc
        ? 'What is exported and shown in Play. Anything outside is cut off. Turn on Bounds (View, below) to see the edge.'
        : 'The document fits whatever is drawn, with a small margin. Fix a size to export a frame (a video size, a post…).'}
    </p>{/if}
  </Section>
  <Section title="Seed generator" bind:open={sectionOpen.seed}>
    <ParamRow label="Seed" for="scene-seed-generator">
      <NumberField id="scene-seed-generator" value={editor.seedGenerator} min={0} max={2147483647} step={1} onchange={(v) => editor.setSeedGenerator(v)} />
    </ParamRow>
    <div class="actions">
      <Button label="Link all seeds" title="Link numeric effect seeds to this generator, preserving their current differences" onclick={() => editor.linkSeedsToGenerator()} />
    </div>
    {#if editor.showInfo}<p class="note">Linked effect seeds vary together while keeping their relative offsets. In the poster demo, changing this seed also rebuilds its layout.</p>{/if}
  </Section>
  <Section title="Canvas" bind:open={sectionOpen.canvas}>
    <ParamRow label="Background">
      <ColorField value={editor.canvas || DEFAULT_CANVAS} label="Canvas background" swatches={editor.docColors} onchange={(v) => editor.setCanvas(v)} />
      {#if editor.canvas}<Button label="Reset" title="Use the default canvas background" onclick={() => editor.setCanvas('')} />{/if}
    </ParamRow>
    {#if editor.showInfo}<p class="note">For viewing only; it is not included in the exported SVG.</p>{/if}
  </Section>
  <Section title="Palette" bind:open={sectionOpen.palette}>
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
    {#if editor.showInfo}<p class="note">The chosen palette shows in every color picker. Save keeps this document's colors as a palette of your own, in this browser.</p>{/if}
  </Section>
  {#if editor.showInfo}<p class="hint">Select an object or a modifier to edit it. Drop more SVGs to add objects.</p>{/if}
  <div class="custom-block">
    <h2>Custom Variables</h2>
    {#if Object.keys(custom).length}
      {#each Object.entries(custom) as [name, value] (name)}
          {@const expression = isNumericExpression(value) ? value : null}
          {@const expressionError = expression ? validateExpression(expression.$expr) : null}
          <div class="variable-item">
            <label for={`custom-variable-${name}`}>{name}</label>
            <div class="variable-controls">
              {#if expression}
                <div class="variable-expression" data-invalid={expressionError || undefined}>
                  <input
                    id={`custom-variable-${name}`}
                    class="expression-input"
                    value={expression.$expr}
                    aria-label={`${name} expression`}
                    aria-invalid={expressionError ? 'true' : undefined}
                    title={expressionError ?? 'Use scene variables, scene.custom.name, and math functions such as min, max, sin and cos.'}
                    spellcheck="false"
                    oninput={(e) => setVariable(name, { ...expression, $expr: e.currentTarget.value })}
                    onkeydown={(e) => e.stopPropagation()}
                  />
                  <button class="expression-toggle" type="button" aria-label={`Use a number for ${name}`} title="Switch to a number" onclick={() => setVariable(name, expression.fallback)}>ƒx</button>
                  {#if expressionError}<span class="expression-error" role="status">{expressionError}</span>{/if}
                </div>
              {:else}
                <NumberField
                  id={`custom-variable-${name}`}
                  value={value as number}
                  step={0.1}
                  width="100%"
                  label={`${name} custom variable`}
                  trailingAction={{ label: `Use an expression for ${name}`, title: 'Use an expression with scene variables and other custom variables', onclick: () => setVariable(name, { $expr: String(value), fallback: value as number }) }}
                  onchange={(v) => setVariable(name, v)}
                />
              {/if}
              <span class="variable-action variable-trash"><IconButton icon="trash" label={`Remove ${name}`} onclick={() => removeVariable(name)} /></span>
            </div>
          </div>
      {/each}
    {:else}
      {#if editor.showInfo}<p class="note">No custom variables. Add one to use it in expressions as <code>scene.custom.name</code>.</p>{/if}
    {/if}
    <div class="variable-add-block">
      <label for="custom-variable-new">Add custom variable</label>
      <div class="variable-add">
        <input
          id="custom-variable-new"
          class="name variable-name"
          placeholder="variable_name"
          aria-label="Custom variable name"
          spellcheck="false"
          bind:value={variableName}
          onkeydown={(e) => e.key === 'Enter' && addVariable()}
        />
        <span class="variable-action"><IconButton icon="plus" label="Add variable" disabled={!validVariableName} onclick={addVariable} /></span>
      </div>
    </div>
    {#if editor.showInfo}<p class="custom-help">Use <code>scene.custom.name</code> in numeric expressions. Variables can reference each other, for example <code>scene.custom.rows * 2</code>. They are stored in this scene's JSON under <code>custom</code>; expression values include a fallback for missing or circular references.</p>{/if}
  </div>
</div>

<style>
  header { display: flex; align-items: center; gap: var(--sv-space-8); height: 28px; padding: 0 var(--sv-space-8); }
  h2 { margin: 0; font-size: var(--sv-font-size-11); color: var(--sv-text-primary); }
  .meta { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .spacer { flex: 1; }
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
  .variable-item { padding: var(--sv-space-4) var(--sv-space-8); }
  .variable-item > label { display: block; margin-bottom: var(--sv-space-4); color: var(--sv-text-secondary); }
  .variable-controls, .variable-add { display: flex; align-items: center; gap: var(--sv-space-8); }
  .variable-add { padding: var(--sv-space-4) var(--sv-space-8); }
  .variable-add-block { margin-top: var(--sv-space-12); }
  .variable-add-block > label { display: block; margin: 0 var(--sv-space-8) var(--sv-space-4); color: var(--sv-text-secondary); }
  .variable-controls :global(.sv-field) { width: 100% !important; flex: 1 1 auto !important; min-width: 0; }
  .variable-name { width: auto; flex: 1 1 auto; min-width: 0; }
  .variable-action :global(.sv-icon-button) { width: 20px; height: 20px; color: var(--sv-text-muted); }
  .variable-trash :global(.sv-icon) { transform: scale(0.8); }
  .variable-expression {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: var(--sv-space-4);
    height: 20px;
    min-width: 0;
    padding: 0 var(--sv-space-6);
    box-sizing: border-box;
    background: var(--sv-surface-field);
    border: var(--sv-border-1) solid var(--sv-rule-default);
  }
  .variable-expression:focus-within { outline: 1px solid var(--sv-accent-fill); outline-offset: 1px; }
  .variable-expression[data-invalid] { border-color: var(--sv-signal-error); }
  .expression-input { flex: 1; min-width: 0; padding: 0; color: var(--sv-text-primary); background: none; border: 0; outline: none; font: inherit; }
  .expression-toggle { flex: none; width: 18px; height: 16px; padding: 0; color: var(--sv-text-muted); background: none; border: 0; font: inherit; font-size: var(--sv-font-size-10); line-height: 1; cursor: pointer; }
  .expression-toggle:hover { color: var(--sv-accent-fill); }
  .expression-error { position: absolute; z-index: 4; top: calc(100% + var(--sv-space-4)); left: 0; width: 100%; padding: var(--sv-space-4) var(--sv-space-6); box-sizing: border-box; color: var(--sv-signal-error); background: var(--sv-surface-panel); border: var(--sv-border-1) solid var(--sv-signal-error); font-size: var(--sv-font-size-11); line-height: 1.3; overflow-wrap: anywhere; }
  .custom-block { margin-top: var(--sv-space-16); padding: var(--sv-space-8) 0 var(--sv-space-24); border-top: var(--sv-border-1) solid var(--sv-rule-default); }
  .custom-block h2 { padding-left: var(--sv-space-8); }
  .custom-help { margin: var(--sv-space-12) var(--sv-space-8) 0; color: var(--sv-text-muted); font-size: var(--sv-font-size-11); line-height: 1.5; }
  code { color: var(--sv-text-secondary); }
  .note, .hint { margin: var(--sv-space-8); color: var(--sv-text-muted); font-size: var(--sv-font-size-11); line-height: 1.5; }
</style>
