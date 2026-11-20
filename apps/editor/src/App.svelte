<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Component } from 'svelte';
  import { builtins, createEngine, hasFont, sceneDuration, sceneFonts, toAnimatedSVG, toLottie, type SceneV1 } from '@svertik/engine';
  import { BUNDLED, ensureFont, loadBundled } from './fonts';
  // La versión, de un solo sitio: el package.json del editor.
  import { version } from '../package.json';
  import { IconButton } from '@svertik/ui';
  import Canvas from './Canvas.svelte';
  import { DEFAULT_CANVAS, Editor, locateModifier, locateNode } from './editor.svelte';
  import { providePalettes } from '@svertik/ui';
  import { DEMOS, type DemoName } from './demo-catalog';
  import { canPickFiles, download, saveProjectFile, sceneJSON } from './exporters';
  import InspectorPanel from './InspectorPanel.svelte';
  import Presenter from './Presenter.svelte';
  import Timeline from './Timeline.svelte';
  import TimeControls from './TimeControls.svelte';
  import UnsavedDialog from './UnsavedDialog.svelte';
  import MissingSvgsDialog from './MissingSvgsDialog.svelte';
  import ShortcutsDialog from './ShortcutsDialog.svelte';
  import ExportReport from './ExportReport.svelte';
  import NotesPanel from './NotesPanel.svelte';
  import FxPanel from './FxPanel.svelte';
  import DiagnosticsPanel from './DiagnosticsPanel.svelte';
  import { formatBytes, inspectSvgComplexity, summarizeScene, svgComplexityWarnings, type SvgComplexity } from './debug-report';
  import Toolbar from './Toolbar.svelte';
  import ModifierRail from './ModifierRail.svelte';
  import CommandLine from './CommandLine.svelte';
  import ViewMenu from './ViewMenu.svelte';
  import './menu.css';
  import type { CanvasStatus } from './canvas-status';

  const editor = new Editor();
  // Lo publica el lienzo: poner una primitiva en el centro de lo que se ve (doble clic en el rail).
  let placeAtCenter = $state<((type: string) => void) | undefined>(undefined);
  let canvasStatus = $state<CanvasStatus | null>(null);
  let inspectorTab = $state<'stack' | 'document'>('stack');
  function showDocumentTab() {
    canvasStatus?.clearSelection();
    inspectorTab = 'document';
  }
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
  type PerformanceProfile = { running: boolean; samples: number[]; frame: number; total: number; totalFrames: number; fps: number; duration: number };
  let profile = $state<PerformanceProfile>({ running: false, samples: [], frame: 0, total: 0, totalFrames: 0, fps: 30, duration: 0 });
  let profileFrame = $state<{ runId: number; index: number } | null>(null);
  let profileRunId = 0;
  let profilePending: { runId: number; index: number; timer: ReturnType<typeof setTimeout>; setupMs: number; resolve: (ms: number | null) => void } | null = null;
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
  function onProfileFrame(runId: number, index: number, ms: number) {
    const pending = profilePending;
    if (!pending || pending.runId !== runId || pending.index !== index) return;
    clearTimeout(pending.timer);
    profilePending = null;
    profile = { ...profile, samples: [...profile.samples, ms + pending.setupMs], frame: index + 1 };
    pending.resolve(ms);
  }
  function stopPerformanceProfile() {
    if (!profile.running) return;
    profileRunId++;
    const pending = profilePending;
    if (pending) {
      clearTimeout(pending.timer);
      profilePending = null;
      pending.resolve(null);
    }
    profileFrame = null;
    profile = { ...profile, running: false };
    editor.playing = false;
    recordActivity('Performance profile stopped');
  }
  async function runPerformanceProfile() {
    if (profile.running) { stopPerformanceProfile(); return; }
    if (panelMaximized) { panelMaximized = false; await tick(); }
    const sourceScene = editor.scene;
    if (!sourceScene) return;
    const runId = ++profileRunId;
    const duration = Math.max(0.1, editor.animation?.duration ?? (sceneDuration(sourceScene) || 3));
    const fps = Math.max(1, Math.min(120, Math.round(editor.animation?.fps ?? 30)));
    const totalFrames = Math.ceil(duration * fps) + 1;
    const total = Math.min(totalFrames, 600);
    const frameIndex = (i: number) => total === totalFrames ? i : Math.round(i * (totalFrames - 1) / (total - 1));
    profile = { running: true, samples: [], frame: 0, total, totalFrames, fps, duration };
    editor.playing = false;
    recordActivity('Performance profile started', `${duration.toFixed(2)} s · ${total} samples`);
    const playbackStarted = performance.now();
    try {
      for (let i = 0; i < total; i++) {
        if (profileRunId !== runId) break;
        if (editor.scene !== sourceScene) { stopPerformanceProfile(); break; }
        const atFrame = frameIndex(i);
        const time = Math.min(duration, atFrame / fps);
        const ms = await new Promise<number | null>((resolve) => {
          const timer = setTimeout(() => {
            if (profilePending?.runId === runId && profilePending.index === i) profilePending = null;
            resolve(null);
          }, 3000);
          const started = performance.now();
          profilePending = { runId, index: i, timer, setupMs: 0, resolve };
          editor.setTime(time);
          if (profilePending?.runId === runId && profilePending.index === i) profilePending.setupMs = performance.now() - started;
          profileFrame = { runId, index: i };
        });
        if (ms === null) {
          if (profileRunId === runId) addDiagnostic('Performance', 'error', 'Could not capture a canvas frame. Make sure the canvas is visible and try again.');
          break;
        }
        await tick();
        if (i + 1 < total) {
          const nextTime = Math.min(duration, frameIndex(i + 1) / fps);
          const target = playbackStarted + nextTime * 1000;
          while (profileRunId === runId && performance.now() < target) {
            await new Promise<void>((resolve) => setTimeout(resolve, Math.min(50, target - performance.now())));
          }
        }
      }
    } finally {
      if (profileRunId === runId) {
        profileFrame = null;
        editor.playing = false;
        editor.setTime(duration);
        profile = { ...profile, running: false };
        if (profile.samples.length) recordActivity('Performance profile complete', `${profile.samples.length} frames measured`);
      }
    }
  }
  const logCodeDiagnostic = (source: string, level: 'error' | 'warning', message: string, stack?: string) => addDiagnostic(source, level, message, stack);
  const sceneSummary = $derived(diagnosticsOpen ? summarizeScene(editor.scene, false) : null);
  const togglePanelMaximized = () => {
    if (!panelMaximized && profile.running) stopPerformanceProfile();
    panelMaximized = !panelMaximized;
  };
  function toggleDiagnostics() {
    if (diagnosticsOpen && profile.running) stopPerformanceProfile();
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
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
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
    if (/^image\/(png|webp|jpeg)$/i.test(file.type) || /\.(png|webp|jpe?g)$/i.test(file.name)) {
      const bitmap = await createImageBitmap(file);
      const { width, height } = bitmap;
      bitmap.close();
      const href = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read image.'));
        reader.onerror = () => reject(reader.error ?? new Error('Could not read image.'));
        reader.readAsDataURL(file);
      });
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image href="${href}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/></svg>`;
      editor.load(svg, file.name);
      return;
    }
    // An SVG the open project is waiting for (saved without embedding it) fills its objects instead of being added.
    if (editor.missingSvgs.some((href) => href.replace(/^.*[\\/]/, '') === file.name)) {
      await attachSvgs([file]);
      return;
    }
    const text = await file.text();
    // A project (JSON, or a bare scene's JSON; .svrtk too): it opens whole. Otherwise it is an SVG to add.
    if (/\.(svrtk|json)$/i.test(file.name) || /^\s*\{/.test(text)) {
      guard(() => {
        if (editor.openProject(text)) {
          projectHandle = null;
          missingDismissed = false;
          recordActivity('Opened project');
          say(`Opened ${file.name}`);
        } else editor.error = 'That file is not a svertik project.';
      });
      return;
    }
    reportSvgImport(text, 'Imported SVG');
    editor.load(text, file.name);
  }
  // SVGs a project keeps outside: the dialog asks for them once per opened project.
  let missingDismissed = $state(false);
  async function attachSvgs(files: File[]) {
    const texts = new Map<string, string>();
    for (const file of files) texts.set(file.name, await file.text());
    const found = editor.attachSvgFiles(texts);
    const left = editor.missingSvgs.length;
    say(found ? `Attached ${found} SVG${found === 1 ? '' : 's'}${left ? `, ${left} still missing` : ''}` : 'Those SVGs are not the ones this project needs');
  }
  // The file this project was saved to (Chrome, Edge): ⌘S writes into it again; Save as picks another.
  let projectHandle: FileSystemFileHandle | null = null;
  /** Saves the project; resolves false if the user cancelled the file picker or writing failed. */
  async function saveProject(as = false): Promise<boolean> {
    const text = editor.projectFile();
    if (!text) return false;
    try {
      const saved = await saveProjectFile(text, `${editor.name}.json`, as ? null : projectHandle);
      if (!saved) return false;
      if (saved !== 'downloaded') {
        projectHandle = saved;
        // The name chosen in the picker becomes the project's name.
        const picked = saved.name.replace(/\.(svrtk|json)$/i, '');
        if (picked && picked !== editor.name) {
          editor.name = picked;
          // The name is part of the file: write it again with the new one.
          const renamed = editor.projectFile();
          if (renamed) await saveProjectFile(renamed, saved.name, saved);
        }
      }
      editor.markSaved();
      const file = saved === 'downloaded' ? `${editor.name}.json` : saved.name;
      say(editor.embedSources ? `Saved ${file}` : `Saved ${file} without its SVGs: keep them next to it`);
      return true;
    } catch (error) {
      console.error('svertik: could not save the project', error);
      say('Could not save the project');
      return false;
    }
  }
  // Lo que cambia de archivo (nuevo, abrir un proyecto, una demo) pregunta antes si hay cambios sin guardar.
  let pending = $state<(() => void) | null>(null);
  function guard(run: () => void) {
    if (editor.dirty) pending = run;
    else run();
  }
  async function resolvePending(save: boolean) {
    const run = pending;
    pending = null;
    // Cancelling the save keeps the current document open.
    if (save && !(await saveProject())) return;
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
  let videoExport = $state<{ progress: number; controller: AbortController } | null>(null);
  async function exportMP4() {
    if (!editor.scene || videoExport) return;
    const scene = snapshot();
    const name = editor.name;
    const background = editor.canvas || DEFAULT_CANVAS;
    const controller = new AbortController();
    videoExport = { progress: 0, controller };
    try {
      const { downloadMP4 } = await import('./video');
      await downloadMP4(createEngine(builtins), scene, {
        background, name, signal: controller.signal,
        onProgress: progress => { if (videoExport) videoExport.progress = progress; },
      });
      recordActivity('Exported MP4');
      say('MP4 downloaded');
    } catch (error) {
      say(controller.signal.aborted ? 'MP4 export cancelled' : error instanceof Error ? error.message : 'Could not export MP4.');
    } finally {
      videoExport = null;
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
      projectHandle = null;
      recordActivity('Opened demo', which);
      editor.demoOrigin = demo.which;
      editor.selected = null;
      editor.timelineOpen = demo.view === 'timeline';
      editor.setTime(0);
      // With "reduce motion" on, a demo opens paused: the timeline's play button starts it.
      const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      editor.playing = !!editor.animation && demo.view !== 'presenter' && !reduceMotion;
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
  // The command line's "export <format>" goes through the same functions as the Export menu.
  editor.exporter = (format) => ({
    svg: exportSVG,
    png: () => exportPNG(2),
    mp4: exportMP4,
    animsvg: exportAnimatedSVG,
    lottie: exportLottie,
    json: () => copy(sceneJSON(snapshot()), 'JSON'),
  })[format]();

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
    // The command line: "/" outside text fields, ⌘K from anywhere.
    if (e.key === '?' && !mod && !e.altKey && !typing(e)) {
      e.preventDefault();
      editor.showShortcuts = true;
    } else if (editor.scene && ((e.key === '/' && !mod && !e.altKey && !typing(e)) || (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k'))) {
      e.preventDefault();
      editor.openCommand();
    } else if (e.key.toLowerCase() === 'k' && !mod && !e.altKey && editor.selected && !typing(e)) {
      e.preventDefault();
      const n = editor.keySelectionHere();
      if (n) say(`${n} key${n === 1 ? '' : 's'} at ${editor.time.toFixed(2)} s`);
    } else if (mod && !e.altKey && e.key.toLowerCase() === 'a' && !typing(e)) {
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      editor.selectAll();
    } else if (mod && e.key.toLowerCase() === 'z' && !typing(e)) {
      e.preventDefault();
      if (e.shiftKey) editor.redo();
      else editor.undo();
    } else if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void saveProject(e.shiftKey);
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
    const image = Array.from(e.clipboardData?.files ?? []).find((file) => /^image\/(png|webp|jpeg)$/i.test(file.type))
      ?? Array.from(e.clipboardData?.items ?? []).find((item) => /^image\/(png|webp|jpeg)$/i.test(item.type))?.getAsFile()
      ?? null;
    if (image) { e.preventDefault(); void openFile(image); return; }
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
    // Cerrar o recargar la pestaña con cambios sin guardar: el navegador pregunta antes
    // (con su propio mensaje, que no se puede cambiar).
    const leave = (e: BeforeUnloadEvent) => {
      if (!editor.dirty) return;
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
    onsave={() => saveProject()}
    onsaveas={canPickFiles() ? () => saveProject(true) : undefined}
    oncopyjson={() => copy(sceneJSON(snapshot()), 'JSON')}
    onexport={exportSVG}
    onexportpng={() => exportPNG(2)}
    onexportmp4={exportMP4}
    onexportlottie={exportLottie}
    onexportanimsvg={exportAnimatedSVG}
    ondemo={openDemo}
    onnew={() => guard(() => { projectHandle = null; editor.returnToStart(); })}
  />
  <main class:panel-maximized={panelMaximized}>
    {#if !panelMaximized}<ModifierRail {editor} {placeAtCenter} />{/if}
    <div
      class="left"
      class:maximized={panelMaximized}
      style:grid-template-rows={panelMaximized ? 'minmax(0, 1fr)' : [
          'minmax(0, 1fr)',
          ...(editor.notesOpen && editor.scene ? ['minmax(120px, 25%)'] : []),
          ...(editor.fxOpen && editor.scene ? ['minmax(140px, 32%)'] : []),
          ...(diagnosticsOpen ? [profile.running || profile.samples.length ? 'minmax(180px, 34%)' : 'minmax(100px, 22%)'] : []),
          ...(editor.codeOpen && editor.scene ? ['6px', `${codeHeight}px`] : []),
          ...(editor.timelineOpen && editor.scene ? ['minmax(120px, 30%)'] : []),
        ].join(' ')}
    >
      {#if !panelMaximized}<Canvas {editor} {profileFrame} onprofileframe={onProfileFrame} onimport={() => fileInput.click()} onfile={openFile} ondemo={openDemo} bind:placeAtCenter bind:status={canvasStatus} ondiagnostic={(level, message, stack) => addDiagnostic('Canvas', level, message, stack)} />{/if}
      {#if !panelMaximized && editor.fxOpen && editor.scene}<FxPanel {editor} onclose={() => (editor.fxOpen = false)} oncopy={copy} />{/if}
      {#if editor.notesOpen && editor.scene}<NotesPanel {editor} maximized={panelMaximized} onmaximize={togglePanelMaximized} onclose={() => { editor.notesOpen = false; panelMaximized = false; }} oncopy={copy} />{/if}
      {#if diagnosticsOpen}<DiagnosticsPanel
        entries={diagnostics}
        {sceneSummary}
        {latestSvg}
        {activities}
        {profile}
        maximized={panelMaximized}
        onmaximize={togglePanelMaximized}
        onclose={() => { if (profile.running) stopPerformanceProfile(); diagnosticsOpen = false; panelMaximized = false; }}
        onclear={() => (diagnostics = [])}
        oncopy={copy}
        report={() => JSON.stringify(makeDebugReport(), null, 2)}
        onbundle={downloadDebugBundle}
        onprofile={runPerformanceProfile}
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
      <InspectorPanel {editor} bind:active={inspectorTab} onreplace={() => replaceInput.click()} />
    </aside>{/if}
  </main>
  {#snippet diagnosticsToggle()}
    <span class="diagnostics-toggle" data-warning={warningCount > 0 || undefined}>
      <IconButton icon="bug" label={`${diagnosticsOpen ? 'Close' : 'Open'} debug output${diagnostics.length ? ` (${diagnostics.length})` : ''}${warningCount ? ` · ${warningCount} warning${warningCount === 1 ? '' : 's'}` : ''}`} active={diagnosticsOpen} aria-pressed={diagnosticsOpen} onclick={toggleDiagnostics} />
    </span>
  {/snippet}
  <footer class="status" class:no-inspector={panelMaximized}>
    {#if !editor.commandInEffectsSlot}<CommandLine {editor} />{/if}
    {#if canvasStatus}
      <!-- Three groups, left to right: the canvas view, time, and the panels. Version info goes last, dimmed. -->
      <div class="canvas-status status-group" role="group" aria-label="Canvas view">
        <span class="pct" title="Zoom (wheel or pinch)">{canvasStatus.percent}%</span>
        <button type="button" onclick={canvasStatus.fit} title="Fit (⇧1)">Fit</button>
        <button type="button" onclick={canvasStatus.actualSize} title="100% (⇧0)">100%</button>
        <button type="button" class="redraw" onclick={canvasStatus.redraw} title="Redraw everything" aria-label="Redraw">↻</button>
        <button type="button" class="size" title="Document: size and canvas" onclick={showDocumentTab}>{canvasStatus.width} × {canvasStatus.height}</button>
        {#if canvasStatus.cost !== null}
          <!-- While the canvas is still, the figure is the last redraw's (nothing is running): dimmed, no warning sign. -->
          <span class="cost" data-slow={canvasStatus.slow || undefined} data-idle={canvasStatus.idle || undefined} title={canvasStatus.idle ? `Last redraw took ${Math.round(canvasStatus.cost)} ms. Nothing is being computed now.` : canvasStatus.slow ? 'Slow: try fewer copies, a coarser resolution, or turning off heavy effects' : 'Time to evaluate and draw'}>
            {canvasStatus.slow && !canvasStatus.idle ? '⚠ ' : ''}{Math.round(canvasStatus.cost)} ms
          </span>
        {/if}
      </div>
      {#if !editor.animationDisabled}
        <div class="status-group" role="group" aria-label="Time"><TimeControls {editor} /></div>
      {/if}
      <div class="status-actions status-group" role="group" aria-label="Panels">
        <button type="button" class="fx" aria-pressed={editor.fxOpen} onclick={() => (editor.fxOpen = !editor.fxOpen)} title="Formula reference: variables and functions" disabled={!editor.scene}>ƒx {editor.fxOpen ? '▾' : '▴'}</button>
        <ViewMenu {editor} />
        <button type="button" aria-pressed={editor.notesOpen} onclick={() => (editor.notesOpen = !editor.notesOpen)} title="Scene notes" disabled={!editor.scene}>Notes {editor.notesOpen ? '▾' : '▴'}</button>
        <button type="button" aria-pressed={editor.codeOpen} onclick={() => (editor.codeOpen = !editor.codeOpen)} title="Code">Code {editor.codeOpen ? '▾' : '▴'}</button>
        {#if !editor.animationDisabled}
          <button type="button" aria-pressed={editor.timelineOpen} onclick={() => (editor.timelineOpen = !editor.timelineOpen)} title="Timeline">Timeline {editor.timelineOpen ? '▾' : '▴'}</button>
        {/if}
        {@render diagnosticsToggle()}
      </div>
    {:else}
      <div class="status-actions">{@render diagnosticsToggle()}</div>
    {/if}
    <span class="status-meta">svertik {version} alpha · {builtins.length} modifiers</span>
  </footer>
  <input
    bind:this={fileInput}
    type="file"
    accept=".svg,image/svg+xml,.png,image/png,.webp,image/webp,.jpg,.jpeg,image/jpeg,.json,application/json,.svrtk"
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
  {#if editor.showShortcuts}<ShortcutsDialog onclose={() => (editor.showShortcuts = false)} />{/if}
  {#if editor.missingSvgs.length && !missingDismissed && !pending}<MissingSvgsDialog files={editor.missingSvgs} onfiles={(files) => void attachSvgs(files)} onclose={() => (missingDismissed = true)} />{/if}
  {#if pending}<UnsavedDialog name={editor.name} onsave={() => resolvePending(true)} ondiscard={() => resolvePending(false)} oncancel={() => (pending = null)} />{/if}
  {#if videoExport}
    <div class="video-export">
      <span role="status">Exporting MP4… {Math.round(videoExport.progress * 100)}%</span>
      <button type="button" onclick={() => videoExport?.controller.abort()}>Cancel</button>
    </div>
  {/if}
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
    color: var(--sv-text-muted);
    font-size: var(--sv-font-size-11);
  }
  .canvas-status { display: flex; align-items: center; gap: var(--sv-space-12); min-width: 0; }
  /* Groups are split by a 1 px rule; every control in the bar is 20 px high with the same outline. */
  .status-group { display: flex; align-items: center; min-width: 0; }
  .status-group + .status-group { padding-left: var(--sv-space-12); border-left: var(--sv-border-1) solid var(--sv-rule-default); }
  .canvas-status button { height: 20px; padding: 0 var(--sv-space-6); color: var(--sv-text-secondary); background: none; border: var(--sv-border-1) solid var(--sv-rule-default); cursor: pointer; font: inherit; }
  .canvas-status button:hover { color: var(--sv-text-primary); border-color: var(--sv-text-muted); }
  .canvas-status .pct, .canvas-status .cost { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .canvas-status .size { color: var(--sv-text-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .canvas-status .cost { flex: 0 0 9ch; width: 9ch; text-align: right; }
  .canvas-status .size { padding: 0 var(--sv-space-4); background: none; border: 0; cursor: pointer; }
  .canvas-status .size:hover { color: var(--sv-text-primary); text-decoration: underline; }
  .canvas-status .cost[data-slow] { color: var(--sv-signal-error); }
  .canvas-status .cost[data-idle] { color: var(--sv-text-muted); }
  .status-actions { display: flex; align-items: center; gap: var(--sv-space-4); margin-left: auto; }
  .status-actions button { height: 20px; padding: 0 var(--sv-space-6); font: inherit; color: var(--sv-text-secondary); background: none; border: var(--sv-border-1) solid var(--sv-rule-default); cursor: pointer; }
  .status-actions button:hover { color: var(--sv-text-primary); border-color: var(--sv-text-muted); }
  .status-actions button[aria-pressed='true'] { color: var(--sv-accent-fill); border-color: var(--sv-accent-fill); }
  .status-meta { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); white-space: nowrap; }
  .diagnostics-toggle { display: flex; align-items: center; }
  .diagnostics-toggle :global(.sv-icon-button) { width: 20px; height: 20px; color: var(--sv-text-muted); }
  .diagnostics-toggle :global(.sv-icon) { width: 13px; height: 13px; }
  .diagnostics-toggle :global(.sv-icon-button:hover) { color: var(--sv-text-primary); }
  .diagnostics-toggle[data-warning] :global(.sv-icon-button) { color: var(--sv-signal-warning); }
  .video-export {
    position: fixed;
    z-index: 110;
    left: 50%;
    bottom: 48px;
    translate: -50% 0;
    display: flex;
    align-items: center;
    gap: var(--sv-space-12);
    padding: var(--sv-space-8) var(--sv-space-12);
    color: var(--sv-text-primary);
    background: var(--sv-surface-panel);
    border: var(--sv-border-1) solid var(--sv-rule-default);
    font-size: var(--sv-font-size-12);
  }
  .video-export button {
    font: inherit;
    color: var(--sv-text-primary);
    background: none;
    border: var(--sv-border-1) solid var(--sv-rule-strong);
    padding: var(--sv-space-4) var(--sv-space-8);
    cursor: pointer;
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
    main {
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-rows: minmax(280px, 1fr) auto;
      grid-template-areas: 'rail left' 'rail inspector';
    }
    .inspector { border-left: 0; border-top: var(--sv-border-1) solid var(--sv-rule-default); max-height: 55dvh; }
    main.panel-maximized { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); grid-template-areas: 'left'; }
  }
</style>
