<script lang="ts">
  import { onMount } from 'svelte';
  import type { Component } from 'svelte';
  import { builtins, createEngine, hasFont, sceneFonts, toAnimatedSVG, toLottie, type SceneV1 } from '@svertik/engine';
  import { BUNDLED, ensureFont, loadBundled } from './fonts';
  // La versión, de un solo sitio: el package.json del editor.
  import { version } from '../package.json';
  import { Checkbox, IconButton } from '@svertik/ui';
  import Canvas from './Canvas.svelte';
  import { Editor, locateModifier, locateNode } from './editor.svelte';
  import { providePalettes } from '@svertik/ui';
  import { DEMOS, type DemoName } from './demo-catalog';
  import { download, sceneJSON } from './exporters';
  import InspectorPanel from './InspectorPanel.svelte';
  import Presenter from './Presenter.svelte';
  import Timeline from './Timeline.svelte';
  import TimeControls from './TimeControls.svelte';
  import UnsavedDialog from './UnsavedDialog.svelte';
  import ExportReport from './ExportReport.svelte';
  import NotesPanel from './NotesPanel.svelte';
  import DiagnosticsPanel from './DiagnosticsPanel.svelte';
  import { formatBytes, inspectSvgComplexity, summarizeScene, svgComplexityWarnings, type SvgComplexity } from './debug-report';
  import Toolbar from './Toolbar.svelte';
  import ModifierRail from './ModifierRail.svelte';
  import type { CanvasStatus } from './canvas-status';

  const editor = new Editor();
  // Lo publica el lienzo: poner una primitiva en el centro de lo que se ve (doble clic en el rail).
  let placeAtCenter = $state<((type: string) => void) | undefined>(undefined);
  let canvasStatus = $state<CanvasStatus | null>(null);
  // El panel de código se carga en su propio chunk (sólo cuando se abre): CodeMirror y el resto del
  // panel no van en el arranque, sino en la fase de la UI.
  let CodePanelComp = $state<Component<{ editor: Editor; oncopy: (text: string, what: string) => void | boolean | Promise<void | boolean>; maximized: boolean; onmaximize: () => void; ondiagnostic: (source: string, level: 'error' | 'warning', message: string, stack?: string) => void; onactivity: (action: string, detail?: string) => void }> | undefined>(undefined);
  let panelMaximized = $state(false);
  let diagnosticsOpen = $state(false);
  type DiagnosticEntry = { id: number; level: 'error' | 'warning'; source: string; message: string; time: number; stack?: string };
  type ActivityEntry = { time: number; action: string; detail?: string };
  let diagnostics = $state<DiagnosticEntry[]>([]);
  const warningCount = $derived(diagnostics.filter(entry => entry.level === 'warning').length);
  let activities = $state<ActivityEntry[]>([]);
  let latestSvg = $state<SvgComplexity | null>(null);
  let diagnosticId = 0;
  function addDiagnostic(source: string, level: 'error' | 'warning', message: string, stack?: string) {
    const last = diagnostics.at(-1);
    if (last?.source === source && last.level === level && last.message === message && last.stack === stack) return;
    diagnostics = [...diagnostics.slice(-199), { id: ++diagnosticId, level, source, message, time: Date.now(), ...(stack ? { stack } : {}) }];
  }
  function recordActivity(action: string, detail?: string) {
    const last = activities.at(-1);
    if (last?.action === action && last.detail === detail && Date.now() - last.time < 3000) return;
    activities = [...activities.slice(-49), { time: Date.now(), action, ...(detail ? { detail } : {}) }];
  }
  const logCodeDiagnostic = (source: string, level: 'error' | 'warning', message: string, stack?: string) => addDiagnostic(source, level, message, stack);
  const sceneSummary = $derived(diagnosticsOpen ? summarizeScene(editor.scene, false) : null);
  const togglePanelMaximized = () => (panelMaximized = !panelMaximized);
  function toggleDiagnostics() {
    diagnosticsOpen = !diagnosticsOpen;
    if (diagnosticsOpen) {
      editor.notesOpen = false;
      editor.codeOpen = false;
      editor.timelineOpen = false;
      editor.playing = false;
      panelMaximized = false;
    }
  }
  // Las paletas del selector de color, para todos los ColorField de la app.
  providePalettes({
    get list() {
      return editor.palettes;
    },
    get current() {
      return editor.paletteName;
    },
    select: (name) => editor.selectPalette(name),
  });
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
  const snapshot = () => $state.snapshot(editor.scene) as SceneV1;
  function reportSvgImport(source: string, action: string) {
    if (!/<svg[\s>]/i.test(source)) return;
    latestSvg = inspectSvgComplexity(source);
    const detail = latestSvg.analysisSkipped
      ? `${formatBytes(latestSvg.bytes)}; structure scan skipped`
      : `${formatBytes(latestSvg.bytes)}; ${latestSvg.elements.toLocaleString()} elements; ${latestSvg.pathCommands.toLocaleString()} path commands`;
    recordActivity(action, detail);
    for (const warning of svgComplexityWarnings(latestSvg)) addDiagnostic('SVG import', 'warning', warning);
  }
  function makeDebugReport() {
    const scene = editor.scene ? $state.snapshot(editor.scene) as SceneV1 : null;
    const nav = typeof navigator === 'undefined' ? null : navigator;
    return {
      format: 'svertik-debug-report',
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      app: { version, modifierCount: builtins.length },
      environment: nav ? {
        userAgent: nav.userAgent,
        language: nav.language,
        platform: nav.platform,
        devicePixelRatio: window.devicePixelRatio,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      } : null,
      scene: summarizeScene(scene),
      mostRecentSvgImport: latestSvg,
      recentEvents: activities,
      diagnostics: diagnostics.map(({ time, ...entry }) => ({ time: new Date(time).toISOString(), ...entry })),
    };
  }
  function downloadDebugBundle(includeProject: boolean) {
    const report = makeDebugReport();
    const projectFile = includeProject ? editor.projectFile() : null;
    const bundle = {
      report,
      ...(projectFile ? { project: JSON.parse(projectFile) as unknown } : {}),
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    download(`svertik-debug-${stamp}.json`, JSON.stringify(bundle, null, 2), 'application/json');
    recordActivity('Downloaded debug report', includeProject ? 'Project included by user' : 'Metadata only');
  }
  /** La escena en el instante que se ve (para exportar el fotograma: el Delay de Effector depende de él). */
  const frame = () => {
    const s = snapshot();
    s.at = editor.time;
    return s;
  };

  async function openFile(file: File) {
    const text = await file.text();
    // Un proyecto (.svrtk, o el JSON de una escena): se abre entero. Si no, es un SVG que se añade.
    if (/\.(svrtk|json)$/i.test(file.name) || /^\s*\{/.test(text)) {
      guard(() => {
        if (editor.openProject(text)) {
          recordActivity('Opened project');
          say(`Opened ${file.name}`);
        } else editor.error = 'That file is not a svertik project.';
      });
      return;
    }
    reportSvgImport(text, 'Imported SVG');
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
    if (editor.currentNode) {
      const source = await file.text();
      reportSvgImport(source, 'Replaced SVG source');
      editor.replaceSource(editor.currentNode.id, source, file.name);
    }
  }
  async function copy(text: string, what: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      say(`${what} copied`);
      return true;
    } catch {
      say(`Could not copy ${what}`);
      return false;
    }
  }
  /** PNG del fotograma actual, a doble resolución y con fondo transparente (lo dibuja el navegador). */
  async function exportPNG(scale = 2) {
    recordActivity('Exported PNG');
    const svg = engine.toSVG(frame());
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
  function openDemo(which: DemoName = 'intro') {
    guard(() => startDemo(which));
  }
  function startDemo(which: DemoName) {
    const demo = DEMOS.find((item) => item.which === which);
    if (!demo) return;
    if (editor.openProject(JSON.stringify(demo.create()))) {
      recordActivity('Opened demo', which);
      editor.selected = null;
      editor.timelineOpen = demo.view === 'timeline';
      editor.setTime(0);
      editor.playing = !!editor.animation && demo.view !== 'presenter';
      editor.presenting = demo.view === 'presenter';
    }
  }
  // Lottie: la animación para apps y webs; lo que no se puede llevar, en un informe al terminar.
  let report = $state<{ title: string; summary: string; warnings: string[] } | null>(null);
  function exportLottie() {
    recordActivity('Exported Lottie');
    const { data, warnings, frames } = toLottie(engine, snapshot(), { name: editor.name });
    const text = JSON.stringify(data);
    const name = `${editor.name}.lottie.json`;
    download(name, text, 'application/json');
    const kb = Math.max(1, Math.round(new Blob([text]).size / 1024));
    report = { title: `Saved ${name}`, summary: `${frames} frame${frames === 1 ? '' : 's'}, ${kb} KB.${warnings.length ? ' Some things could not go into Lottie:' : ' Everything went in.'}`, warnings };
  }
  // SVG animado: un solo .svg que se anima solo (CSS dentro), sin JavaScript.
  function exportAnimatedSVG() {
    recordActivity('Exported animated SVG');
    const { svg, warnings, frames } = toAnimatedSVG(engine, snapshot());
    const name = `${editor.name}.animated.svg`;
    download(name, svg, 'image/svg+xml');
    const kb = Math.max(1, Math.round(new Blob([svg]).size / 1024));
    report = { title: `Saved ${name}`, summary: `${frames} frame${frames === 1 ? '' : 's'}, ${kb} KB. Plays on its own in any browser (also as an <img>).${warnings.length ? ' Notes:' : ''}`, warnings };
  }
  function exportSVG() {
    recordActivity('Exported SVG');
    const name = `${editor.name}.svertik.svg`;
    download(name, engine.toSVG(frame()), 'image/svg+xml');
    say(`Saved ${name}`);
  }

  const typing = (e: Event) => {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  };
  function keydown(e: KeyboardEvent) {
    // En el modo Play, el editor está detrás: sus atajos no actúan.
    if (editor.presenting || pending || report) return;
    if (panelMaximized && e.key === 'Escape') {
      e.preventDefault();
      panelMaximized = false;
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    // ⌘⇧V: pegar en el mismo sitio. El evento de pegar no lleva las teclas: se anota aquí.
    if (mod && e.key.toLowerCase() === 'v') pasteInPlace = e.shiftKey;
    if (mod && !e.altKey && e.key.toLowerCase() === 'a' && !typing(e)) {
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      editor.selectAll();
    } else if (mod && e.key.toLowerCase() === 'z' && !typing(e)) {
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
      reportSvgImport(text, 'Pasted SVG');
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
    const runtimeError = (e: ErrorEvent) => addDiagnostic('Runtime', 'error', e.message || 'Unknown runtime error', e.error instanceof Error ? e.error.stack : undefined);
    const rejected = (e: PromiseRejectionEvent) => addDiagnostic('Runtime', 'error', e.reason instanceof Error ? e.reason.message : String(e.reason), e.reason instanceof Error ? e.reason.stack : undefined);
    addEventListener('error', runtimeError);
    addEventListener('unhandledrejection', rejected);
    return () => {
      removeEventListener('beforeunload', leave);
      removeEventListener('error', runtimeError);
      removeEventListener('unhandledrejection', rejected);
    };
  });

  $effect(() => {
    if (editor.error) addDiagnostic('Editor', 'error', editor.error);
  });

  // Las fuentes que usan los textos de la escena: la incluida, o se bajan de Fontsource.
  $effect(() => {
    if (!editor.scene) return;
    for (const f of sceneFonts($state.snapshot(editor.scene) as SceneV1)) {
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

  // El panel de código se carga al abrirse (su propio chunk): CodeMirror y el resto del panel no van
  // en el arranque, sino en la fase de la UI.
  $effect(() => {
    if (!editor.codeOpen || !editor.scene) return;
    let alive = true;
    void (async () => {
      const { default: CodePanelCompCtor } = await import('./CodePanel.svelte');
      if (alive) CodePanelComp = CodePanelCompCtor;
    })();
    return () => {
      alive = false;
    };
  });
  // One playback clock for both the compact controls and the full timeline.
  $effect(() => {
    if (!editor.playing || !editor.scene || editor.presenting) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const dt = (now - last) / 1000;
      last = now;
      editor.advancePlayback(dt);
      if (editor.playing) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });
  $effect(() => {
    if (!editor.codeOpen && !editor.notesOpen && !diagnosticsOpen) panelMaximized = false;
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
  <main class:panel-maximized={panelMaximized}>
    {#if !panelMaximized}<ModifierRail {editor} {placeAtCenter} />{/if}
    <div
      class="left"
      class:maximized={panelMaximized}
      style:grid-template-rows={panelMaximized ? 'minmax(0, 1fr)' : [
          'minmax(0, 1fr)',
          ...(editor.notesOpen && editor.scene ? ['minmax(120px, 25%)'] : []),
          ...(diagnosticsOpen ? ['minmax(100px, 22%)'] : []),
          ...(editor.codeOpen && editor.scene ? ['6px', `${codeHeight}px`] : []),
          ...(editor.timelineOpen && editor.scene ? ['minmax(120px, 30%)'] : []),
        ].join(' ')}
    >
      {#if !panelMaximized}<Canvas {editor} onimport={() => fileInput.click()} onfile={openFile} ondemo={openDemo} bind:placeAtCenter bind:status={canvasStatus} ondiagnostic={(level, message, stack) => addDiagnostic('Canvas', level, message, stack)} />{/if}
      {#if editor.notesOpen && editor.scene}<NotesPanel {editor} maximized={panelMaximized} onmaximize={togglePanelMaximized} onclose={() => { editor.notesOpen = false; panelMaximized = false; }} oncopy={copy} />{/if}
      {#if diagnosticsOpen}<DiagnosticsPanel
        entries={diagnostics}
        {sceneSummary}
        {latestSvg}
        {activities}
        maximized={panelMaximized}
        onmaximize={togglePanelMaximized}
        onclose={() => { diagnosticsOpen = false; panelMaximized = false; }}
        onclear={() => (diagnostics = [])}
        oncopy={copy}
        report={() => JSON.stringify(makeDebugReport(), null, 2)}
        onbundle={downloadDebugBundle}
      />{/if}
      {#if editor.codeOpen && editor.scene && CodePanelComp}
        {#if !panelMaximized}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="resize" title="Drag to resize" onpointerdown={startResize}></div>
        {/if}
        <CodePanelComp editor={editor} oncopy={copy} maximized={panelMaximized} onmaximize={togglePanelMaximized} ondiagnostic={logCodeDiagnostic} onactivity={recordActivity} />
      {/if}
      {#if !panelMaximized && editor.timelineOpen && editor.scene}<Timeline {editor} />{/if}
    </div>
    {#if !panelMaximized}<aside class="inspector">
      <InspectorPanel {editor} onreplace={() => replaceInput.click()} />
      <div class="view" class:off={!editor.scene}>
        <strong>View</strong>
        <label><Checkbox bind:checked={editor.showOriginal} label="Show original" disabled={!editor.scene} /> Original</label>
        <label><Checkbox bind:checked={editor.showWire} label="Wire view" disabled={!editor.scene} /> Wire</label>
        <label title="The edge of the document: what is exported and shown in Play"><Checkbox bind:checked={editor.showBounds} label="Show document bounds" disabled={!editor.scene} /> Bounds</label>
      </div>
    </aside>{/if}
  </main>
  <footer class="status" class:no-inspector={panelMaximized}>
    {#if canvasStatus}
      <div class="canvas-status">
        <span class="pct" title="Zoom (wheel or pinch)">{canvasStatus.percent}%</span>
        <button type="button" onclick={canvasStatus.fit} title="Fit (⇧1)">Fit</button>
        <button type="button" onclick={canvasStatus.actualSize} title="100% (⇧0)">100%</button>
        <button type="button" class="redraw" onclick={canvasStatus.redraw} title="Redraw everything" aria-label="Redraw">↻</button>
        <button type="button" class="size" title="Document: size and canvas" onclick={canvasStatus.clearSelection}>{canvasStatus.width} × {canvasStatus.height}</button>
        {#if canvasStatus.cost !== null}
          <span class="cost" data-slow={canvasStatus.slow || undefined} title={canvasStatus.slow ? 'Slow: try fewer copies, a coarser resolution, or turning off heavy effects' : 'Time to evaluate and draw'}>
            {canvasStatus.slow ? '⚠ ' : ''}{Math.round(canvasStatus.cost)} ms
          </span>
        {/if}
      </div>
      <TimeControls {editor} />
      <div class="status-actions">
        <button type="button" aria-pressed={editor.notesOpen} onclick={() => (editor.notesOpen = !editor.notesOpen)} title="Scene notes" disabled={!editor.scene}>Notes {editor.notesOpen ? '▾' : '▴'}</button>
        <button type="button" aria-pressed={editor.codeOpen} onclick={() => (editor.codeOpen = !editor.codeOpen)} title="Code">Code {editor.codeOpen ? '▾' : '▴'}</button>
        <button type="button" aria-pressed={editor.timelineOpen} onclick={() => (editor.timelineOpen = !editor.timelineOpen)} title="Timeline">Timeline {editor.timelineOpen ? '▾' : '▴'}</button>
      </div>
    {/if}
    <div class="status-meta">
      <span>svertik {version} alpha</span>
      <span>engine · {builtins.length} modifiers</span>
      <span class="diagnostics-toggle" data-warning={warningCount > 0 || undefined}>
        <IconButton icon="bug" label={`${diagnosticsOpen ? 'Close' : 'Open'} debug output${diagnostics.length ? ` (${diagnostics.length})` : ''}${warningCount ? ` · ${warningCount} warning${warningCount === 1 ? '' : 's'}` : ''}`} active={diagnosticsOpen} aria-pressed={diagnosticsOpen} onclick={toggleDiagnostics} />
      </span>
    </div>
  </footer>
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
  .app { display: grid; grid-template-rows: auto 1fr auto; height: 100dvh; }
  main {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 300px;
    grid-template-areas: 'rail left inspector';
    min-height: 0;
  }
  .left { grid-area: left; display: grid; min-height: 0; min-width: 0; }
  main.panel-maximized { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'left'; }
  .left.maximized { grid-template-rows: minmax(0, 1fr); }
  .resize {
    cursor: ns-resize;
    background: var(--sv-surface-panel);
    border-top: var(--sv-border-1) solid var(--sv-rule-default);
  }
  .resize:hover { background: var(--sv-accent-selection); }
  .inspector {
    grid-area: inspector;
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
  /* Barra de estado: cruza toda la ventana, debajo del rail, el lienzo y el inspector. */
  .status {
    position: relative;
    display: flex;
    justify-content: flex-start;
    align-items: center;
    min-height: 28px;
    flex-wrap: wrap;
    gap: var(--sv-space-4) var(--sv-space-12);
    padding: var(--sv-space-4) var(--sv-space-8);
    background: var(--sv-surface-panel);
    border-top: var(--sv-border-1) solid var(--sv-rule-default);
    color: var(--sv-text-disabled);
    font-size: var(--sv-font-size-10);
  }
  .canvas-status { display: flex; align-items: center; gap: var(--sv-space-12); min-width: 0; }
  .canvas-status button { height: 22px; padding: 0 var(--sv-space-6); color: var(--sv-text-secondary); background: none; border: var(--sv-border-1) solid var(--sv-rule-default); cursor: pointer; font: inherit; }
  .canvas-status button:hover { color: var(--sv-text-primary); border-color: var(--sv-text-muted); }
  .canvas-status .pct, .canvas-status .size, .canvas-status .cost { color: var(--sv-text-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .canvas-status .size { padding: 0 var(--sv-space-4); background: none; border: 0; cursor: pointer; }
  .canvas-status .size:hover { color: var(--sv-text-primary); text-decoration: underline; }
  .canvas-status .cost[data-slow] { color: var(--sv-signal-error); }
  .status-actions { display: flex; align-items: center; gap: var(--sv-space-4); margin-left: auto; padding-left: var(--sv-space-12); border-left: var(--sv-border-1) solid var(--sv-rule-default); }
  .status-actions button { height: 18px; padding: 0 var(--sv-space-6); font: inherit; color: var(--sv-text-secondary); background: none; border: 1px solid var(--sv-rule-strong); cursor: pointer; }
  .status-actions button:hover { color: var(--sv-text-primary); border-color: var(--sv-text-muted); }
  .status-actions button[aria-pressed='true'] { color: var(--sv-accent-fill); border-color: var(--sv-accent-fill); }
  .status-meta { display: flex; align-items: center; gap: var(--sv-space-12); white-space: nowrap; }
  .diagnostics-toggle { display: flex; align-items: center; }
  .diagnostics-toggle :global(.sv-icon-button) { width: 20px; height: 20px; color: var(--sv-text-muted); }
  .diagnostics-toggle :global(.sv-icon) { width: 13px; height: 13px; }
  .diagnostics-toggle :global(.sv-icon-button:hover) { color: var(--sv-text-primary); }
  .diagnostics-toggle[data-warning] :global(.sv-icon-button) { color: var(--sv-signal-warning, #f5a544); }
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
    main {
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-rows: minmax(280px, 1fr) auto;
      grid-template-areas: 'rail left' 'rail inspector';
    }
    .inspector { border-left: 0; border-top: var(--sv-border-1) solid var(--sv-rule-default); max-height: 55dvh; }
    main.panel-maximized { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); grid-template-areas: 'left'; }
  }
</style>
