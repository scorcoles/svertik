<script lang="ts">
  import { onMount } from 'svelte';
  import { builtins, createEngine, hasFont, walkNodes, type SceneV2 } from '@svertik/engine';
  import { BUNDLED, ensureFont, loadBundled } from './fonts';
  import { Checkbox, ColorField } from '@svertik/ui';
  import Attributes from './Attributes.svelte';
  import Canvas from './Canvas.svelte';
  import CodePanel from './CodePanel.svelte';
  import { Editor, locateModifier, locateNode } from './editor.svelte';
  import { download, sceneJSON } from './exporters';
  import StackPanel from './StackPanel.svelte';
  import Timeline from './Timeline.svelte';
  import Toolbar from './Toolbar.svelte';

  const editor = new Editor();
  if (import.meta.env.DEV) (window as unknown as { editor: Editor }).editor = editor;
  const engine = createEngine(builtins);
  let fileInput: HTMLInputElement;
  let toast = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout>;

  // Alto del panel de código: se arrastra desde su borde superior.
  let codeHeight = $state(300);
  function startResize(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const y0 = e.clientY;
    const h0 = codeHeight;
    const move = (ev: PointerEvent) => (codeHeight = Math.max(140, Math.min(window.innerHeight - 200, h0 + (y0 - ev.clientY))));
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }

  const say = (text: string) => {
    toast = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 1600);
  };
  const snapshot = () => $state.snapshot(editor.scene) as SceneV2;

  async function openFile(file: File) {
    editor.load(await file.text(), file.name);
  }
  // Sustituir el SVG del objeto seleccionado (desde sus atributos).
  let replaceInput: HTMLInputElement;
  async function replaceFile(file: File) {
    if (editor.currentNode) editor.replaceSource(editor.currentNode.id, await file.text(), file.name);
  }
  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      say(`${what} copied`);
    } catch {
      say(`Could not copy ${what}`);
    }
  }
  function exportSVG() {
    const name = `${editor.name}.svertik.svg`;
    download(name, engine.toSVG(snapshot()), 'image/svg+xml');
    say(`Saved ${name}`);
  }

  const typing = (e: Event) => {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  };
  function keydown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z' && !typing(e)) {
      e.preventDefault();
      if (e.shiftKey) editor.redo();
      else editor.undo();
    } else if (mod && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      fileInput.click();
    } else if (e.key.toLowerCase() === 'r' && !mod && !e.altKey && editor.selected && !typing(e)) {
      e.preventDefault();
      editor.randomize();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && editor.selected && !typing(e)) {
      e.preventDefault();
      editor.removeSelection();
    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && editor.selected && editor.scene && !typing(e)) {
      e.preventDefault();
      const at = locateModifier(editor.scene, editor.selected) ?? locateNode(editor.scene.objects, editor.selected);
      if (at) editor.move(editor.selected, at.index + (e.key === 'ArrowUp' ? -1 : 1));
    } else if (mod && (e.code === 'BracketRight' || e.code === 'BracketLeft') && !typing(e)) {
      e.preventDefault();
      const up = e.code === 'BracketRight';
      editor.reorder(e.shiftKey ? (up ? 'front' : 'back') : up ? 'forward' : 'backward');
    } else if (mod && e.key.toLowerCase() === 'd' && !typing(e)) {
      e.preventDefault();
      editor.duplicate();
    } else if (mod && e.key.toLowerCase() === 'g' && !typing(e)) {
      e.preventDefault();
      if (e.shiftKey) editor.ungroup();
      else editor.group();
    }
  }
  // Copiar y cortar: lo seleccionado, como JSON de svertik (vale entre pestañas).
  function copySelection(e: ClipboardEvent, cut = false) {
    if (typing(e) || window.getSelection()?.toString()) return;
    const text = editor.copySelection();
    if (!text) return;
    e.preventDefault();
    e.clipboardData?.setData('text/plain', text);
    if (cut) editor.removeSelection();
    say(cut ? 'Cut' : 'Copied');
  }
  function paste(e: ClipboardEvent) {
    if (typing(e)) return;
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (editor.paste(text)) {
      e.preventDefault();
      return;
    }
    if (/<svg[\s>]/i.test(text)) {
      e.preventDefault();
      editor.load(text, 'pasted.svg');
    }
  }

  onMount(() => {
    void (async () => {
      await loadBundled();
      editor.fonts = Object.keys(BUNDLED);
      editor.fontsTick++;
      await editor.loadFromURL();
    })();
  });

  // Las fuentes que usan los textos de la escena: si alguna es del sistema y ya hay permiso, se lee.
  $effect(() => {
    if (!editor.scene) return;
    const wanted = new Set<string>();
    for (const { node } of walkNodes(editor.scene.objects)) if (node.kind === 'shape' && node.shape === 'text') wanted.add(String(node.params.font ?? 'JetBrains Mono'));
    for (const name of wanted) if (!hasFont(name)) void ensureFont(name).then((ok) => ok && editor.fontsTick++);
  });

  // Avisos del editor (al importar un SVG con texto, por ejemplo): un rato más que los normales.
  $effect(() => {
    const n = editor.notice;
    if (!n) return;
    toast = n;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ((toast = null), (editor.notice = null)), 5000);
  });
</script>

<svelte:window onkeydown={keydown} onpaste={paste} oncopy={(e) => copySelection(e)} oncut={(e) => copySelection(e, true)} />

<div class="app">
  <Toolbar
    {editor}
    onimport={() => fileInput.click()}
    oncopyjson={() => copy(sceneJSON(snapshot()), 'JSON')}
    oncopycode={() => (editor.codeOpen = !editor.codeOpen)}
    onexport={exportSVG}
  />
  <main>
    <div
      class="left"
      style:grid-template-rows={[
        'minmax(0, 1fr)',
        ...(editor.codeOpen && editor.scene ? ['6px', `${codeHeight}px`] : []),
        ...(editor.timelineOpen && editor.scene ? ['minmax(120px, 30%)'] : []),
      ].join(' ')}
    >
      <Canvas {editor} onimport={() => fileInput.click()} onfile={openFile} />
      {#if editor.codeOpen && editor.scene}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="resize" title="Drag to resize" onpointerdown={startResize}></div>
        <CodePanel {editor} oncopy={copy} />
      {/if}
      {#if editor.timelineOpen && editor.scene}<Timeline {editor} />{/if}
    </div>
    <aside class="inspector">
      <StackPanel {editor} />
      <Attributes {editor} onreplace={() => replaceInput.click()} />
      <div class="view" class:off={!editor.scene}>
        <strong>View</strong>
        <label><Checkbox bind:checked={editor.showOriginal} label="Show original" disabled={!editor.scene} /> Original</label>
        <label><Checkbox bind:checked={editor.showWire} label="Wire view" disabled={!editor.scene} /> Wire</label>
        <span class="bg" title="Canvas color (view only, not exported)">
          <ColorField compact value={editor.canvas || '#0b0b0b'} label="Canvas color" swatches={editor.docColors} onchange={(v) => editor.setCanvas(v)} />
          Canvas
        </span>
        {#if editor.canvas}
          <button type="button" class="reset" title="Default canvas color" aria-label="Default canvas color" onclick={() => editor.setCanvas('')}>×</button>
        {/if}
      </div>
      <footer>
        <span>svertik 0.0.0</span>
        <span>engine · {builtins.length} modifiers</span>
      </footer>
    </aside>
  </main>
  <input
    bind:this={fileInput}
    type="file"
    accept=".svg,image/svg+xml"
    multiple
    hidden
    onchange={async (e) => {
      const input = e.currentTarget;
      for (const f of Array.from(input.files ?? [])) await openFile(f);
      input.value = '';
    }}
  />
  <input
    bind:this={replaceInput}
    type="file"
    accept=".svg,image/svg+xml"
    hidden
    onchange={(e) => {
      const f = e.currentTarget.files?.[0];
      if (f) void replaceFile(f);
      e.currentTarget.value = '';
    }}
  />
  {#if toast}<div class="toast" role="status">{toast}</div>{/if}
</div>

<style>
  .app { display: grid; grid-template-rows: auto 1fr; height: 100dvh; }
  main { display: grid; grid-template-columns: minmax(0, 1fr) 300px; min-height: 0; }
  .left { display: grid; min-height: 0; min-width: 0; }
  .resize {
    cursor: ns-resize;
    background: var(--sv-surface-panel);
    border-top: var(--sv-border-1) solid var(--sv-rule-default);
  }
  .resize:hover { background: var(--sv-accent-selection); }
  .inspector {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--sv-surface-panel);
    border-left: var(--sv-border-1) solid var(--sv-rule-default);
  }
  .view {
    display: flex;
    align-items: center;
    gap: var(--sv-space-16);
    flex: none;
    height: 32px;
    padding: 0 var(--sv-space-8);
    border-top: var(--sv-border-1) solid var(--sv-rule-default);
  }
  .view strong { color: var(--sv-text-secondary); }
  .view label { display: flex; align-items: center; gap: var(--sv-space-6); cursor: pointer; }
  .view.off { opacity: 0.35; }
  .bg { margin-left: auto; }
  .bg { display: flex; align-items: center; gap: var(--sv-space-6); }
  .reset { margin-left: calc(var(--sv-space-12) * -1); padding: 0 var(--sv-space-2); font: inherit; color: var(--sv-text-muted); background: none; border: 0; cursor: pointer; }
  .reset:hover { color: var(--sv-text-primary); }
  .inspector footer {
    display: flex;
    justify-content: space-between;
    flex: none;
    height: 28px;
    align-items: center;
    padding: 0 var(--sv-space-8);
    border-top: var(--sv-border-1) solid var(--sv-rule-default);
    color: var(--sv-text-disabled);
    font-size: var(--sv-font-size-10);
  }
  .toast {
    max-width: min(560px, 90vw);
    position: fixed;
    left: 50%;
    bottom: var(--sv-space-16);
    translate: -50% 0;
    padding: var(--sv-space-6) var(--sv-space-12);
    background: var(--sv-text-primary);
    color: var(--sv-surface-app);
    font-weight: var(--sv-font-weight-bold);
  }
  @media (max-width: 760px) {
    main { grid-template-columns: 1fr; grid-template-rows: minmax(280px, 1fr) auto; }
    .inspector { border-left: 0; border-top: var(--sv-border-1) solid var(--sv-rule-default); max-height: 55dvh; }
  }
</style>
