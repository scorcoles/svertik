<script lang="ts">
  import { onMount } from 'svelte';
  import { builtins, createEngine, hasFont, sceneFonts, toAnimatedSVG, toLottie, type SceneV2 } from '@svertik/engine';
  import { BUNDLED, ensureFont, loadBundled } from './fonts';
  // La versión, de un solo sitio: el package.json del editor.
  import { version } from '../package.json';
  import { Checkbox } from '@svertik/ui';
  import Attributes from './Attributes.svelte';
  import Canvas from './Canvas.svelte';
  import CodePanel from './CodePanel.svelte';
  import { Editor, locateModifier, locateNode } from './editor.svelte';
  import { demoProject, reelProject, shatterProject } from './demo';
  import { download, sceneJSON } from './exporters';
  import StackPanel from './StackPanel.svelte';
  import Presenter from './Presenter.svelte';
  import Timeline from './Timeline.svelte';
  import UnsavedDialog from './UnsavedDialog.svelte';
  import ExportReport from './ExportReport.svelte';
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
    const text = await file.text();
    // Un proyecto (.svrtk, o el JSON de una escena): se abre entero. Si no, es un SVG que se añade.
    if (/\.(svrtk|json)$/i.test(file.name) || /^\s*\{/.test(text)) {
      guard(() => {
        if (editor.openProject(text)) say(`Opened ${file.name}`);
        else editor.error = 'That file is not a svertik project.';
      });
      return;
    }
    editor.load(text, file.name);
  }
  function saveProject() {
    const text = editor.projectFile();
    if (!text) return;
    const name = `${editor.name}.svrtk`;
    download(name, text, 'application/json');
    editor.markSaved();
    say(`Saved ${name}`);
  }
  // Lo que cambia de archivo (nuevo, abrir un proyecto, una demo) pregunta antes si hay cambios sin guardar.
  let pending = $state<(() => void) | null>(null);
  function guard(run: () => void) {
    if (editor.dirty) pending = run;
    else run();
  }
  function resolvePending(save: boolean) {
    const run = pending;
    pending = null;
    if (save) saveProject();
    run?.();
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
  /** PNG del fotograma actual, a doble resolución y con fondo transparente (lo dibuja el navegador). */
  async function exportPNG(scale = 2) {
    const svg = engine.toSVG(snapshot());
    const vb = /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(/\s+/).map(Number) ?? [0, 0, 100, 100];
    const [w, h] = [Math.max(1, Math.round(vb[2]! * scale)), Math.max(1, Math.round(vb[3]! * scale))];
    const url = URL.createObjectURL(new Blob([svg.replace('<svg ', `<svg width="${w}" height="${h}" `)], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));
      if (!blob) throw new Error('no PNG');
      const name = `${editor.name}.png`;
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
      a.click();
      URL.revokeObjectURL(a.href);
      say(`Saved ${name} (${w} × ${h})`);
    } catch {
      say('Could not export the PNG');
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  // La demo: un proyecto que se abre y se reproduce solo.
  function openDemo(which: 'intro' | 'shatter' | 'reel' = 'intro') {
    guard(() => startDemo(which));
  }
  function startDemo(which: 'intro' | 'shatter' | 'reel') {
    if (editor.openProject(JSON.stringify(which === 'shatter' ? shatterProject() : which === 'reel' ? reelProject() : demoProject()))) {
      editor.selected = null;
      editor.timelineOpen = true;
      editor.setTime(0);
      editor.playing = true;
    }
  }
  // Lottie: la animación para apps y webs; lo que no se puede llevar, en un informe al terminar.
  let report = $state<{ title: string; summary: string; warnings: string[] } | null>(null);
  function exportLottie() {
    const { data, warnings, frames } = toLottie(engine, snapshot(), { name: editor.name });
    const text = JSON.stringify(data);
    const name = `${editor.name}.lottie.json`;
    download(name, text, 'application/json');
    const kb = Math.max(1, Math.round(new Blob([text]).size / 1024));
    report = { title: `Saved ${name}`, summary: `${frames} frame${frames === 1 ? '' : 's'}, ${kb} KB.${warnings.length ? ' Some things could not go into Lottie:' : ' Everything went in.'}`, warnings };
  }
  // SVG animado: un solo .svg que se anima solo (CSS dentro), sin JavaScript.
  function exportAnimatedSVG() {
    const { svg, warnings, frames } = toAnimatedSVG(engine, snapshot());
    const name = `${editor.name}.animated.svg`;
    download(name, svg, 'image/svg+xml');
    const kb = Math.max(1, Math.round(new Blob([svg]).size / 1024));
    report = { title: `Saved ${name}`, summary: `${frames} frame${frames === 1 ? '' : 's'}, ${kb} KB. Plays on its own in any browser (also as an <img>).${warnings.length ? ' Notes:' : ''}`, warnings };
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
    // En el modo Play, el editor está detrás: sus atajos no actúan.
    if (editor.presenting || pending || report) return;
    const mod = e.metaKey || e.ctrlKey;
    // ⌘⇧V: pegar en el mismo sitio. El evento de pegar no lleva las teclas: se anota aquí.
    if (mod && e.key.toLowerCase() === 'v') pasteInPlace = e.shiftKey;
    if (mod && e.key.toLowerCase() === 'z' && !typing(e)) {
      e.preventDefault();
      if (e.shiftKey) editor.redo();
      else editor.undo();
    } else if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveProject();
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
  /** ⌘⇧V: lo pegado queda donde estaba el original, sin desplazarlo. */
  let pasteInPlace = false;
  function paste(e: ClipboardEvent) {
    const inPlace = pasteInPlace;
    pasteInPlace = false;
    if (typing(e) || editor.presenting) return;
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (editor.paste(text, inPlace ? 0 : 16)) {
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
    // Cerrar o recargar la pestaña con cambios que se perderían: el navegador pregunta antes (con su propio
    // mensaje; no se puede cambiar). Si la escena ya está en la URL (cabe), no pregunta: se recupera.
    const leave = (e: BeforeUnloadEvent) => {
      if (!editor.wouldLose) return;
      e.preventDefault();
      e.returnValue = '';
    };
    addEventListener('beforeunload', leave);
    return () => removeEventListener('beforeunload', leave);
  });

  // Las fuentes que usan los textos de la escena: la incluida, o se bajan de Fontsource.
  $effect(() => {
    if (!editor.scene) return;
    for (const f of sceneFonts($state.snapshot(editor.scene) as SceneV2)) {
      if (!hasFont(f.key)) void ensureFont(f.family, f.weight, f.italic).then((ok) => ok && editor.fontsTick++);
    }
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
    onsave={saveProject}
    oncopyjson={() => copy(sceneJSON(snapshot()), 'JSON')}
    onexport={exportSVG}
    onexportpng={() => exportPNG(2)}
    onexportlottie={exportLottie}
    onexportanimsvg={exportAnimatedSVG}
    ondemo={openDemo}
    onnew={() => guard(() => editor.newFile())}
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
      <Canvas {editor} onimport={() => fileInput.click()} onfile={openFile} ondemo={openDemo} />
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
        <label title="The edge of the document: what is exported and shown in Play"><Checkbox bind:checked={editor.showBounds} label="Show document bounds" disabled={!editor.scene} /> Bounds</label>
      </div>
      <footer>
        <span>svertik {version} alpha</span>
        <span>engine · {builtins.length} modifiers</span>
      </footer>
    </aside>
  </main>
  <input
    bind:this={fileInput}
    type="file"
    accept=".svg,image/svg+xml,.svrtk,.json,application/json"
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
  {#if editor.presenting && editor.scene}<Presenter {editor} />{/if}
  {#if report}<ExportReport {...report} onclose={() => (report = null)} />{/if}
  {#if pending}<UnsavedDialog name={editor.name} onsave={() => resolvePending(true)} ondiscard={() => resolvePending(false)} oncancel={() => (pending = null)} />{/if}
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
