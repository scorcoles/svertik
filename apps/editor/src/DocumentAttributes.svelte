<script lang="ts">
  import { t } from '@svertik/ui';
  // With nothing selected: the document. Its size is what is exported and what Play mode shows.
  import { Button, Checkbox, ColorField, IconButton, NumberField, ParamRow, Section, Segmented, Select } from '@svertik/ui';
  import { DOCUMENT_PALETTE, PALETTES, type CustomVariable, type ViewportFit } from '@svertik/engine';
  import { DEFAULT_CANVAS, type Editor } from './editor.svelte';
  import VariableList from './VariableList.svelte';

  let { editor }: { editor: Editor } = $props();
  const canPick = typeof window !== 'undefined' && 'EyeDropper' in window;
  let pickingBackground = $state(false);
  async function pickBackground() {
    if (!canPick || pickingBackground) return;
    pickingBackground = true;
    try {
      const EyeDropperApi = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
      editor.setCanvas((await new EyeDropperApi().open()).sRGBHex);
    } catch {
      // Cancelling the screen picker leaves the background unchanged.
    } finally {
      pickingBackground = false;
    }
  }
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
  // Palettes: the one shown in the colour picker, applying it to the drawing and saving the document's.
  const current = $derived(editor.palettes.find((p) => p.name === editor.paletteName));
  const chips = $derived(current?.colors ?? editor.docColors);
  const own = $derived(!!current && !PALETTES.some((p) => p.name === current.name));
  let saving = $state('');
  let sectionOpen = $state({ size: true, time: true, seed: true, canvas: true, palette: true, variables: true });
  const custom = $derived(editor.scene?.custom ?? {});
  function save() {
    if (editor.savePalette(saving)) saving = '';
  }
  function setMode(mode: string) {
    if (mode === 'auto') editor.setDocument(null);
    // When fixed, it starts at the size of what is drawn (and centred on it): nothing is cut.
    else editor.fitDocument();
  }
  function setVariable(name: string, value: unknown) { editor.setCustomVariables({ ...custom, [name]: value as CustomVariable }); }
  function removeVariable(name: string) {
    const next = { ...custom }; delete next[name]; editor.setCustomVariables(Object.keys(next).length ? next : null);
  }
  function renameVariable(from: string, to: string) {
    editor.setCustomVariables(Object.fromEntries(Object.entries(custom).map(([key, value]) => [key === from ? to : key, value])));
  }
  function setAllSections(open: boolean) {
    sectionOpen = { size: open, time: open, seed: open, canvas: open, palette: open, variables: open };
  }
</script>

<div class="doc">
  <header>
    <h2>{t('Document')}</h2><span class="meta">{editor.viewportFit ? `viewport · ${editor.viewportFit}` : doc ? 'fixed' : 'auto'}</span><span class="spacer" aria-hidden="true"></span>
    <IconButton icon="expand-all" label={t('Expand all document sections')} onclick={() => setAllSections(true)} />
    <IconButton icon="collapse-all" label={t('Collapse all document sections')} onclick={() => setAllSections(false)} />
  </header>
  <Section title={t('Size')} bind:open={sectionOpen.size}>
    <ParamRow label={t('Size')} info={doc ? t('This is the exported frame and the document boundary. Play can show overflow unless Clip is on; turn on Bounds in View to see the edge.') : t('Auto fits whatever is drawn, with a small margin. Fixed sets an export frame for video or posts.')} showInfo={editor.showInfo}>
      <Segmented value={doc ? 'fixed' : 'auto'} label={t('Document size')} options={[{ value: 'auto', label: t('Auto') }, { value: 'fixed', label: t('Fixed') }]} onchange={setMode} />
    </ParamRow>
    {#if doc}
      <ParamRow label={t('Preset')}>
        <Select
          value={preset}
          options={[CUSTOM, ...PRESETS.map(([n]) => n)]}
          label={t('Size preset')}
          width="132px"
          onchange={(v) => {
            const p = PRESETS.find(([n]) => n === v);
            if (p) editor.setDocument({ width: p[1], height: p[2] });
          }}
        />
      </ParamRow>
      <div class="dimensions">
        <ParamRow label={t('Width')} for="doc-w">
          <NumberField id="doc-w" value={doc.width} min={1} step={1} unit="px" onchange={(v) => editor.setDocument({ width: v, height: doc.height }, false)} />
        </ParamRow>
        <ParamRow label={t('Height')} for="doc-h">
          <NumberField id="doc-h" value={doc.height} min={1} step={1} unit="px" onchange={(v) => editor.setDocument({ width: doc.width, height: v }, false)} />
        </ParamRow>
        <span class="swap"><IconButton icon="swap" label={t('Swap document width and height')} onclick={() => editor.setDocument({ width: doc.height, height: doc.width })} /></span>
      </div>
    {/if}
    <div class="full-viewport-row">
      <label for="doc-full-viewport">{t('Full')}</label>
      <input id="doc-full-viewport" type="checkbox" aria-label={t('Full viewport')} title={t('Fill the available viewport in Play')} checked={!!editor.viewportFit} onchange={(event) => editor.setFullViewport(event.currentTarget.checked)} />
    </div>
    {#if doc}
      <div class="full-viewport-row">
        <label for="doc-clip">{t('Clip')}</label>
        <input id="doc-clip" type="checkbox" aria-label={t('Clip to the document in Play')} title={t('In Play, hide whatever lies outside the document')} checked={editor.scene?.clipToDocument === true} onchange={(event) => editor.setClipToDocument(event.currentTarget.checked)} />
      </div>
    {/if}
    {#if doc}
      <div class="full-viewport-row">
        <label for="doc-physics-bounds">{t('Walls')}</label>
        <input id="doc-physics-bounds" type="checkbox" aria-label={t('Document edges are physics walls')} title={t('Physics: bodies bounce off the document\'s edges (with Adapt, the screen\'s)')} checked={editor.scene?.physicsBounds === true} onchange={(event) => editor.setPhysicsBounds(event.currentTarget.checked)} />
      </div>
    {/if}
    <div class="full-viewport-row">
      <label for="doc-embed-svgs">{t('SVGs')}</label>
      <input id="doc-embed-svgs" type="checkbox" aria-label={t('Embed SVG files in the project')} title={t('Save imported SVGs inside the project file. Off: the project keeps only their file names, and the SVGs stay next to it')} checked={editor.embedSources} onchange={(event) => (editor.embedSources = event.currentTarget.checked)} />
    </div>
    {#if editor.viewportFit}
      <ParamRow label={t('Fit')} info={t('In Play, Contain shows the whole document, Cover fills and crops, and Stretch fills both axes. Adapt gives the document the screen\'s shape, so formulas and physics walls see the screen\'s size. The editor and exports keep the document size.')} showInfo={editor.showInfo}>
        <!-- As CSS object-fit: Contain shows it all, Cover fills and crops, Stretch fills and distorts. Adapt resizes the document. -->
        <!-- A list, not a segmented control: four options don't fit the inspector's width. -->
        <Select value={editor.viewportFit} label={t('Fit to the screen')} width="132px" options={[{ value: 'contain', label: t('Contain') }, { value: 'cover', label: t('Cover') }, { value: 'stretch', label: t('Stretch') }, ...(doc ? [{ value: 'adapt', label: t('Adapt') }] : [])]} onchange={(v) => editor.setViewportFit(v as ViewportFit)} />
      </ParamRow>
      {#if editor.viewportFit === 'adapt' && doc}
        <ParamRow label={t('Content')} for="doc-adapt-content" info={t('On: the content scales to fit the screen. Off: it keeps the document\'s size, centred.')} showInfo={editor.showInfo}>
          <Checkbox id="doc-adapt-content" label={t('Scale the content to the screen')} checked={editor.adaptContent} onchange={(value) => editor.setAdaptContent(value)} />
        </ParamRow>
      {/if}
    {/if}
    {#if doc}
      <div class="actions"><Button label={t('Fit to drawing')} onclick={() => editor.fitDocument()} /></div>
    {/if}
  </Section>
  <Section title={t('Time')} bind:open={sectionOpen.time}>
    <ParamRow label={t('Infinite')} for="doc-infinite-time" info={editor.animation?.infinite ? "The clock keeps running after the duration. Timeline tracks hold their final state; use a looping composition for repetition." : undefined} showInfo={editor.showInfo}>
      <Checkbox id="doc-infinite-time" label={t('Infinite time')} checked={editor.animation?.infinite === true} onchange={(value) => editor.setInfiniteTime(value)} />
    </ParamRow>
  </Section>
  <Section title={t('Seed generator')} bind:open={sectionOpen.seed}>
    <ParamRow label={t('Seed')} for="scene-seed-generator" info={t('Linked effect seeds vary together while keeping their relative offsets. Changing this seed can also rebuild seeded layouts.')} showInfo={editor.showInfo}>
      <NumberField id="scene-seed-generator" value={editor.seedGenerator} min={0} max={2147483647} step={1} onchange={(v) => editor.setSeedGenerator(v)} />
      <!-- The dice, as on effects: a new random seed (everything linked to the generator changes with it). -->
      <IconButton icon="dice" label={t('New random seed')} onclick={() => editor.setSeedGenerator(Math.floor(Math.random() * 100000))} />
    </ParamRow>
    <ParamRow label={t('Every')} for="scene-seed-every" info={t('Choose a new seed every N seconds of playback (0 = off). A looping timeline repeats the sequence; Infinite keeps generating new seeds.')} showInfo={editor.showInfo}>
      <!-- Re-seed on a beat (scene time, so it plays the same in Play and exports); 0 = keep this seed. -->
      <NumberField id="scene-seed-every" value={editor.seedEvery} min={0} step={0.1} unit="s" onchange={(v) => editor.setSeedEvery(v)} />
    </ParamRow>
    <ParamRow label={t('On load')} for="scene-seed-on-load" info={t('Play draws a new seed every time the scene loads, so it comes out different on each visit. The editor and exports keep this seed.')} showInfo={editor.showInfo}>
      <Checkbox id="scene-seed-on-load" label={t('New seed on every load')} checked={editor.scene?.seedOnLoad === true} onchange={(value) => editor.setSeedOnLoad(value)} />
    </ParamRow>
    <div class="actions">
      <Button label={t('Link all seeds')} title={t('Link numeric effect seeds to this generator, preserving their current differences')} onclick={() => editor.linkSeedsToGenerator()} />
    </div>
  </Section>
  <Section title={t('Canvas')} bind:open={sectionOpen.canvas}>
    <ParamRow label={t('Background')} info={t('For viewing only; it is not included in the exported SVG.')} showInfo={editor.showInfo}>
      <ColorField value={editor.canvas || DEFAULT_CANVAS} label={t('Canvas background')} swatches={editor.docColors} onchange={(v) => editor.setCanvas(v)} />
      <span class="background-actions">
        <IconButton icon="eyedropper" label={canPick ? t('Pick document background from screen') : t('Screen color picker is not supported in this browser')} disabled={!canPick || pickingBackground} onclick={pickBackground} />
        {#if editor.canvas}<IconButton icon="close" label={t('Use the default canvas background')} onclick={() => editor.setCanvas('')} />{/if}
      </span>
    </ParamRow>
  </Section>
  <Section title={t('Palette')} bind:open={sectionOpen.palette}>
    <ParamRow label={t('Palette')} info={t('The chosen palette appears in every color picker. Save keeps this document\'s colors as a palette in this browser.')} showInfo={editor.showInfo}>
      <Select
        value={editor.paletteName}
        options={[DOCUMENT_PALETTE, ...editor.palettes.map((p) => p.name)]}
        label={t('Palette')}
        width="132px"
        onchange={(v) => editor.selectPalette(v)}
      />
      {#if own}<IconButton icon="trash" label={t('Delete this palette')} onclick={() => current && editor.deletePalette(current.name)} />{/if}
    </ParamRow>
    {#if chips.length}
      <div class="chips" aria-label={t('Palette colors')}>
        {#each chips as c (c)}<span class="chip" title={c} style:background={c}></span>{/each}
      </div>
    {/if}
    {#if current}
      <div class="actions"><Button label={t('Apply to drawing')} title={t('Change the drawing\'s colors to this palette\'s, darkest to darkest and lightest to lightest')} onclick={() => editor.applyPalette(current.name)} /></div>
    {/if}
    <ParamRow label={t('Save as')}>
      <input
        class="name"
        placeholder={t('Palette name')}
        aria-label={t('New palette name')}
        spellcheck="false"
        bind:value={saving}
        onkeydown={(e) => e.key === 'Enter' && save()}
      />
      <Button label={t('Save')} disabled={!saving.trim() || !editor.docColors.length} onclick={save} />
    </ParamRow>
  </Section>
  <VariableList title={t('Variables')} bind:open={sectionOpen.variables} values={custom} namespace="scene.custom" prefix="var" allowRanges showInfo={editor.showInfo} info={t('Add numeric variables for formulas. Names can be edited; double-click to rename. Formulas can reference scene values and other scene.custom variables.')}
    onchange={setVariable} onremove={removeVariable} onrename={renameVariable} />
</div>

<style>
  .background-actions { display: inline-flex; align-items: center; gap: 0; }
  header { display: flex; align-items: center; gap: var(--sv-space-8); height: 28px; padding: 0 var(--sv-space-8); }
  h2 { margin: 0; font-size: var(--sv-font-size-11); color: var(--sv-text-primary); }
  .meta { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .spacer { flex: 1; }
  .full-viewport-row { display: flex; align-items: center; gap: var(--sv-space-8); height: var(--sv-size-row); padding: 0 var(--sv-space-8); }
  .full-viewport-row label { flex: none; width: 84px; text-align: right; color: var(--sv-text-secondary); cursor: pointer; }
  .full-viewport-row input { width: 12px; height: 12px; margin: 0; accent-color: var(--sv-accent-fill); cursor: pointer; }
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
</style>
