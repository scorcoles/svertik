<script lang="ts">
  import { builtins, createEngine, validateScene, type SceneNode, type SceneV2 } from '@svertik/engine';
  import { Button, IconButton, Tabs } from '@svertik/ui';
  import CodeEditor from './CodeEditor.svelte';
  import { exportJS, extractScript, jsDocument, sourceRanges, syntaxErrorLine } from './code';
  import type { Editor } from './editor.svelte';
  import { sceneJSON } from './exporters';
  import { Runner } from './runner';

  interface Props {
    editor: Editor;
    oncopy: (text: string, what: string) => void;
    maximized: boolean;
    onmaximize: () => void;
  }
  let { editor, oncopy, maximized, onmaximize }: Props = $props();

  const engine = createEngine(builtins);
  let tab = $state('JS');
  let error = $state<{ message: string; line: number | null } | null>(null);
  let cursor = $state<[number, number]>([1, 1]);

  const snapshot = () => $state.snapshot(editor.scene) as SceneV2;
  const frame = () => {
    const s = snapshot();
    if (s.animation) s.at = editor.time;
    return s;
  };
  const jsonDoc = $derived(editor.scene ? sceneJSON(editor.scene) : '');
  const jsDoc = $derived(editor.scene ? jsDocument($state.snapshot(editor.scene) as SceneV2, editor.script) : '');
  const jsFold = $derived(sourceRanges(jsDoc));
  // En el JSON, los SVG van en una sola línea larga: también se pliegan.
  const jsonFold = $derived([...jsonDoc.matchAll(/"source": "/g)].map((m) => {
    const from = m.index! + m[0].length;
    let i = from;
    while (i < jsonDoc.length && jsonDoc[i] !== '"') i += jsonDoc[i] === '\\' ? 2 : 1;
    return [from, i] as [number, number];
  }));

  // SVG plano: se calcula solo con la pestaña abierta y como mucho cinco veces por segundo.
  let svgDoc = $state('');
  let svgTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (tab !== 'SVG' || !editor.scene) return;
    const scene = frame();
    if (editor.preview) scene.objects = $state.snapshot(editor.preview) as SceneNode[];
    clearTimeout(svgTimer);
    svgTimer = setTimeout(() => (svgDoc = engine.toSVG(scene)), 200);
  });

  // ── Validación de lo que llega del código

  // Errores: no se aplica. Avisos (parámetros mal escritos, pistas que no apuntan a nada): se aplica y se dice.
  let warnings = $state<string[]>([]);
  function validate(s: unknown): SceneV2 {
    const report = validateScene(s, builtins);
    if (report.errors.length) throw new Error(report.errors[0]);
    warnings = report.warnings;
    return s as SceneV2;
  }

  // ── JSON editable

  let jsonTimer: ReturnType<typeof setTimeout> | undefined;
  function onJSON(text: string) {
    clearTimeout(jsonTimer);
    jsonTimer = setTimeout(() => {
      try {
        editor.applyScene(validate(JSON.parse(text)));
        error = null;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const pos = /position (\d+)/.exec(message);
        const line = pos ? text.slice(0, Number(pos[1])).split('\n').length : null;
        error = { message, line };
      }
    }, 300);
  }

  // ── JS: se ejecuta en un worker

  const runner = new Runner((m) => {
    if (m.type === 'scene') {
      try {
        editor.applyScene(validate(m.scene));
        error = null;
      } catch (e) {
        error = { message: e instanceof Error ? e.message : String(e), line: null };
      }
      runner.idle();
    } else {
      error = { message: m.message, line: m.line ?? (tab === 'JS' ? syntaxErrorLine(lastRun) : null) };
    }
  });

  let jsTimer: ReturnType<typeof setTimeout> | undefined;
  let lastRun = '';
  function onJS(text: string) {
    clearTimeout(jsTimer);
    jsTimer = setTimeout(() => {
      editor.setScript(extractScript(text));
      lastRun = text;
      runner.run(text);
    }, 400);
  }

  $effect(() => () => {
    runner.kill();
    editor.preview = null;
  });

  function copy() {
    if (!editor.scene) return;
    if (tab === 'JSON') oncopy(jsonDoc, 'JSON');
    else if (tab === 'JS') oncopy(exportJS(snapshot(), editor.script), 'JS');
    else oncopy(engine.toSVG(frame()), 'SVG');
  }

  const hints: Record<string, string> = { JSON: 'scene · editable', JS: 'scene + onFrame', SVG: 'flat output · read-only' };
</script>

<section class="code-panel" aria-label="Code">
  <Tabs bind:value={tab} tabs={['JSON', 'JS', 'SVG']}>
    {#snippet children(t)}
      <div class="body">
        {#if t === 'JSON'}
          <CodeEditor value={jsonDoc} lang="json" label="Scene JSON" fold={jsonFold} errorLine={error?.line ?? null} onchange={onJSON} oncursor={(l, c) => (cursor = [l, c])} />
        {:else if t === 'JS'}
          <CodeEditor value={jsDoc} lang="js" label="Scene and script" fold={jsFold} errorLine={error?.line ?? null} onchange={onJS} oncursor={(l, c) => (cursor = [l, c])} />
        {:else}
          <CodeEditor value={svgDoc} lang="svg" label="Flat SVG" readonly oncursor={(l, c) => (cursor = [l, c])} />
        {/if}
      </div>
    {/snippet}
  </Tabs>
  <div class="head-extra">
    <span class="hint">{hints[tab]}</span>
    <span class="spacer"></span>
    <Button label="Copy" onclick={copy} />
    <IconButton
      icon={maximized ? 'restore' : 'maximize'}
      label={maximized ? 'Restore editor layout' : 'Use all available space for code'}
      aria-pressed={maximized}
      onclick={onmaximize}
    />
    <IconButton icon="down" label="Close code panel" onclick={() => (editor.codeOpen = false)} />
  </div>
  <footer class:error={!!error}>
    {#if error}
      <span>{error.line ? `Line ${error.line}: ` : ''}{error.message}</span>
    {:else if warnings.length}
      <span class="warning" title={warnings.join('\n')}>⚠ {warnings[0]}{warnings.length > 1 ? ` (+${warnings.length - 1} more)` : ''}</span>
    {:else}
      <span class="muted">{tab === 'SVG' ? 'Read-only.' : 'Scene changes apply live. onFrame animations run in exported JS.'}</span>
    {/if}
    <span class="spacer"></span>
    <span class="muted">Ln {cursor[0]}, Col {cursor[1]}</span>
  </footer>
</section>

<style>
  .code-panel {
    position: relative;
    display: grid;
    grid-template-rows: minmax(0, 1fr) 24px;
    min-height: 0;
    background: var(--sv-surface-panel);
  }
  .code-panel :global(.sv-tabs) { display: grid; grid-template-rows: 28px minmax(0, 1fr); min-height: 0; }
  .code-panel :global(.sv-tabs-list) { height: 28px; }
  .code-panel :global(.sv-tab) { flex: none; height: 28px; }
  .code-panel :global([data-tabs-content]) { min-height: 0; }
  .body { height: 100%; min-height: 0; }
  .head-extra {
    position: absolute;
    top: 0;
    left: 180px;
    right: 4px;
    height: 28px;
    display: flex;
    align-items: center;
    gap: var(--sv-space-4);
    pointer-events: none;
  }
  .head-extra > :global(*) { pointer-events: auto; }
  .hint { margin-left: var(--sv-space-12); color: var(--sv-text-muted); font-size: var(--sv-font-size-10); pointer-events: none; }
  .spacer { flex: 1; }
  footer {
    display: flex;
    align-items: center;
    gap: var(--sv-space-12);
    padding: 0 var(--sv-space-12);
    font-size: var(--sv-font-size-10);
    border-top: var(--sv-border-1) solid var(--sv-rule-default);
  }
  footer.error { color: var(--sv-signal-error); }
  .warning { color: var(--sv-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .muted { color: var(--sv-text-muted); }
</style>
