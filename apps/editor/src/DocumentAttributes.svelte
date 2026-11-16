<script lang="ts">
  // Sin nada seleccionado: el documento. Su tamaño es lo que se exporta y lo que enseña el modo Play.
  import { Button, ColorField, IconButton, NumberField, ParamRow, Section, Segmented, Select, Slider } from '@svertik/ui';
  import { DOCUMENT_PALETTE, PALETTES, customNumber, isNumericExpression, isRangedVariable, validateExpression, type CustomVariable, type RangedVariable } from '@svertik/engine';
  import { tick } from 'svelte';
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
  let sectionOpen = $state({ size: true, seed: true, canvas: true, palette: true, variables: true });
  const custom = $derived(editor.scene?.custom ?? {});
  // Variables: renaming in place (double-click the name) and the open range editors (min/max/step).
  let renaming = $state<string | null>(null);
  let rangeOpen = $state<Record<string, boolean>>({});
  const NAME = /^[A-Za-z_][A-Za-z_0-9]*$/;
  function save() {
    if (editor.savePalette(saving)) saving = '';
  }
  function setMode(mode: string) {
    if (mode === 'auto') editor.setDocument(null);
    // Al fijarlo, empieza del tamaño de lo dibujado (y centrado en ello): no se corta nada.
    else editor.fitDocument();
  }
  /** + : a new variable (var1, var2…) with its name ready to type. */
  async function addVariable() {
    let k = 1;
    while (Object.hasOwn(custom, `var${k}`)) k++;
    const name = `var${k}`;
    editor.setCustomVariables({ ...custom, [name]: 0 });
    sectionOpen.variables = true;
    renaming = name;
    await tick();
    const input = document.getElementById(`custom-rename-${name}`) as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }
  function setVariable(name: string, value: CustomVariable) {
    editor.setCustomVariables({ ...custom, [name]: value });
  }
  function removeVariable(name: string) {
    const next = { ...custom };
    delete next[name];
    editor.setCustomVariables(Object.keys(next).length ? next : null);
  }
  /** Rename in place, keeping the order; a taken or invalid name is refused (the old one stays). */
  function rename(from: string, to: string) {
    renaming = null;
    const name = to.trim();
    if (name === from || !NAME.test(name) || Object.hasOwn(custom, name)) return;
    editor.setCustomVariables(Object.fromEntries(Object.entries(custom).map(([k, v]) => [k === from ? name : k, v])));
    if (rangeOpen[from]) rangeOpen = { ...rangeOpen, [name]: true };
  }
  async function copyReference(name: string) {
    try {
      await navigator.clipboard.writeText(`scene.custom.${name}`);
      editor.notice = `Copied scene.custom.${name}`;
    } catch {
      editor.notice = `Use it in expressions as scene.custom.${name}`;
    }
  }
  /** A number's value (plain or ranged); setting it keeps the range. */
  function setNumber(name: string, value: CustomVariable, n: number) {
    setVariable(name, isRangedVariable(value) ? { ...value, value: n } : n);
  }
  /** Range edits: an empty range goes back to a plain number. */
  function setRange(name: string, value: CustomVariable, key: 'min' | 'max' | 'step', n: number | undefined) {
    const base: RangedVariable = isRangedVariable(value) ? { ...value } : { value: customNumber(value) ?? 0 };
    if (n === undefined) delete base[key];
    else base[key] = n;
    const empty = base.min === undefined && base.max === undefined && base.step === undefined;
    setVariable(name, empty ? base.value : base);
  }
  function setAllSections(open: boolean) {
    sectionOpen = { size: open, seed: open, canvas: open, palette: open, variables: open };
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
      <!-- The dice, as on effects: a new random seed (everything linked to the generator changes with it). -->
      <IconButton icon="dice" label="New random seed" onclick={() => editor.setSeedGenerator(Math.floor(Math.random() * 100000))} />
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
  <Section title="Variables" bind:open={sectionOpen.variables}>
    {#snippet action()}<IconButton icon="plus" label="Add variable" onclick={addVariable} />{/snippet}
    {#each Object.entries(custom) as [name, value] (name)}
      {@const expression = isNumericExpression(value) ? value : null}
      {@const expressionError = expression ? validateExpression(expression.$expr) : null}
      {@const ranged = isRangedVariable(value) ? value : null}
      {@const n = customNumber(value) ?? 0}
      <div class="var">
        {#if renaming === name}
          <input
            id={`custom-rename-${name}`}
            class="var-rename"
            value={name}
            aria-label="Variable name"
            spellcheck="false"
            onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') rename(name, e.currentTarget.value); else if (e.key === 'Escape') renaming = null; }}
            onblur={(e) => rename(name, e.currentTarget.value)}
          />
        {:else}
          <button class="var-name" type="button" title={`scene.custom.${name} · click to copy, double-click to rename`} onclick={() => copyReference(name)} ondblclick={() => (renaming = name)}>{name}</button>
        {/if}
        <div class="var-control">
          {#if expression}
            <div class="variable-expression" data-invalid={expressionError || undefined}>
              <input
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
              value={n}
              step={ranged?.step ?? 0.1}
              min={ranged?.min}
              max={ranged?.max}
              width="72px"
              label={`${name} value`}
              trailingAction={{ label: `Use an expression for ${name}`, title: 'Use an expression with scene variables and other custom variables', onclick: () => setVariable(name, { $expr: String(n), fallback: n }) }}
              onchange={(v) => setNumber(name, value, v)}
            />
            {#if ranged && ranged.min !== undefined && ranged.max !== undefined}
              <Slider value={n} min={ranged.min} max={ranged.max} step={ranged.step ?? 0.01} label={name} width="56px" onchange={(v) => setNumber(name, value, v)} />
            {/if}
          {/if}
          <span class="var-actions" data-pinned={rangeOpen[name] || undefined}>
            {#if !expression}<IconButton icon="range" label={rangeOpen[name] ? `Hide ${name} range` : `Set a range for ${name} (slider)`} active={!!rangeOpen[name]} onclick={() => (rangeOpen = { ...rangeOpen, [name]: !rangeOpen[name] })} />{/if}
            <IconButton icon="trash" label={`Remove ${name}`} onclick={() => removeVariable(name)} />
          </span>
        </div>
      </div>
      {#if rangeOpen[name] && !expression}
        <!-- Min / Max / Step: with both ends set, the value gets a slider and stays within them. -->
        <div class="var var-range">
          <span class="var-name var-name-spacer" aria-hidden="true"></span>
          <div class="var-control">
            {#each [['min', 'Min'], ['max', 'Max'], ['step', 'Step']] as const as [key, prefix] (key)}
              {@const set = ranged?.[key] !== undefined}
              <NumberField value={ranged?.[key] ?? (key === 'step' ? 0.1 : key === 'min' ? Math.min(0, n) : Math.max(1, n))} step={0.1} prefix={prefix} width="58px" label={`${name} ${key}`} error={false}
                trailingAction={set ? { label: `Clear ${name} ${key}`, title: `Clear ${key}`, onclick: () => setRange(name, value, key, undefined) } : undefined}
                onchange={(v) => setRange(name, value, key, v)} />
            {/each}
          </div>
        </div>
      {/if}
    {:else}
      {#if editor.showInfo}<p class="note">No variables yet. Add one with + and use it in any numeric expression as <code>scene.custom.name</code>.</p>{/if}
    {/each}
    {#if editor.showInfo && Object.keys(custom).length}<p class="note">Click a name to copy <code>scene.custom.name</code>; double-click to rename. Variables can use each other (<code>scene.custom.rows * 2</code>). A range adds a slider and keeps the value inside it.</p>{/if}
  </Section>
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
  /* Variables: the same row as the other parameters (name column on the left, controls on the right). */
  .var { display: flex; align-items: center; gap: var(--sv-space-8); height: var(--sv-size-row); padding: 0 var(--sv-space-8); }
  .var-name { flex: none; width: 84px; padding: 0; font: inherit; color: var(--sv-text-secondary); text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: none; border: 0; cursor: copy; }
  .var-name:hover { color: var(--sv-text-primary); }
  .var-name-spacer { cursor: default; }
  .var-rename { flex: none; width: 84px; height: 20px; padding: 0 var(--sv-space-4); box-sizing: border-box; font: inherit; color: var(--sv-text-primary); text-align: right; background: var(--sv-surface-field); border: var(--sv-border-1) solid var(--sv-accent-fill); outline: none; }
  .var-control { flex: 1; display: flex; align-items: center; gap: var(--sv-space-4); min-width: 0; }
  /* Row actions show on hover or focus, like the stack's; an open range keeps its button visible. */
  .var-actions { display: flex; margin-left: auto; visibility: hidden; }
  .var:hover .var-actions, .var:focus-within .var-actions, .var-actions[data-pinned] { visibility: visible; }
  .var-actions :global(.sv-icon-button) { width: 20px; height: 20px; }
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
  code { color: var(--sv-text-secondary); }
  .note, .hint { margin: var(--sv-space-8); color: var(--sv-text-muted); font-size: var(--sv-font-size-11); line-height: 1.5; }
</style>
