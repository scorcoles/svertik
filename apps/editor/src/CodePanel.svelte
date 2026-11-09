<script lang="ts">
  import { builtins, createEngine, type Scene } from '@svertik/engine';
  import { Button, IconButton, Tabs } from '@svertik/ui';
  import CodeEditor from './CodeEditor.svelte';
  import { exportJS, extractScript, jsDocument, sourceRange, syntaxErrorLine } from './code';
  import { registry, type Editor } from './editor.svelte';
  import { sceneJSON } from './exporters';
  import { Runner } from './runner';

  interface Props {
    editor: Editor;
    oncopy: (text: string, what: string) => void;
  }
  let { editor, oncopy }: Props = $props();

  const engine = createEngine(builtins);
  let tab = $state('JS');
  let error = $state<{ message: string; line: number | null } | null>(null);
  let playing = $state(false);
  let fps = $state(0);
  let cursor = $state<[number, number]>([1, 1]);

  const snapshot = () => $state.snapshot(editor.scene) as Scene;
  const jsonDoc = $derived(editor.scene ? sceneJSON(editor.scene) : '');
  const jsDoc = $derived(editor.scene ? jsDocument($state.snapshot(editor.scene) as Scene, editor.script) : '');
  const jsFold = $derived(sourceRange(jsDoc));

  // SVG plano: se calcula solo con la pestaña abierta y como mucho cinco veces por segundo.
  let svgDoc = $state('');
  let svgTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (tab !== 'SVG' || !editor.scene) return;
    const scene = snapshot();
    if (editor.preview) scene.stack = $state.snapshot(editor.preview) as Scene['stack'];
    clearTimeout(svgTimer);
    svgTimer = setTimeout(() => (svgDoc = engine.toSVG(scene)), 200);
  });

  // ── Validación de lo que llega del código

  function validate(s: unknown): Scene {
    const scene = s as Scene;
    if (!scene || typeof scene !== 'object') throw new Error('Expected an object');
    if (scene.version !== 1) throw new Error('version must be 1');
    if (typeof scene.source !== 'string') throw new Error('source must be a string with the SVG');
    if (!Array.isArray(scene.stack)) throw new Error('stack must be an array');
    for (const m of scene.stack) {
      if (!m || typeof m.id !== 'string') throw new Error('Every modifier needs a string id');
      if (!registry.has(m.type)) throw new Error(`Unknown modifier "${m.type}"`);
    }
    return scene;
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
      if (!playing) runner.idle();
    } else if (m.type === 'frame') {
      editor.preview = m.stack;
      fps = m.fps;
    } else {
      error = { message: m.message, line: m.line ?? (tab === 'JS' ? syntaxErrorLine(lastRun) : null) };
      stop();
    }
  });

  let jsTimer: ReturnType<typeof setTimeout> | undefined;
  let lastRun = '';
  function onJS(text: string) {
    clearTimeout(jsTimer);
    jsTimer = setTimeout(() => {
      editor.setScript(extractScript(text));
      lastRun = text;
      runner.run(text, playing);
    }, 400);
  }

  function play() {
    if (!editor.scene) return;
    error = null;
    playing = true;
    lastRun = jsDoc;
    runner.run(jsDoc, true);
  }
  function stop() {
    playing = false;
    runner.stop();
    editor.preview = null;
    fps = 0;
  }

  $effect(() => () => {
    runner.kill();
    editor.preview = null;
  });

  function copy() {
    if (!editor.scene) return;
    if (tab === 'JSON') oncopy(jsonDoc, 'JSON');
    else if (tab === 'JS') oncopy(exportJS(snapshot(), editor.script), 'JS');
    else oncopy(engine.toSVG(snapshot()), 'SVG');
  }

  const hints: Record<string, string> = { JSON: 'scene · editable', JS: 'scene + onFrame', SVG: 'flat output · read-only' };
</script>

<section class="code-panel" aria-label="Code">
  <Tabs bind:value={tab} tabs={['JSON', 'JS', 'SVG']}>
    {#snippet children(t)}
      <div class="body">
        {#if t === 'JSON'}
          <CodeEditor value={jsonDoc} lang="json" label="Scene JSON" errorLine={error?.line ?? null} onchange={onJSON} oncursor={(l, c) => (cursor = [l, c])} />
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
    {#if tab === 'JS'}
      <button type="button" class="run" aria-pressed={playing} onclick={() => (playing ? stop() : play())}>
        <span class="glyph" aria-hidden="true">{playing ? '■' : '▶'}</span>{playing ? 'Stop' : 'Run'}
      </button>
    {/if}
    <Button label="Copy" onclick={copy} />
    <IconButton icon="down" label="Close code panel" onclick={() => (editor.codeOpen = false)} />
  </div>
  <footer class:error={!!error}>
    {#if error}
      <span>{error.line ? `Line ${error.line}: ` : ''}{error.message}</span>
    {:else if playing}
      <span class="running">● Running · {fps} fps</span>
      <span class="muted">Edits apply live. Code runs sandboxed.</span>
    {:else}
      <span class="muted">{tab === 'SVG' ? 'Read-only.' : 'Edits to scene apply live. Code runs sandboxed.'}</span>
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
  .run {
    display: flex;
    align-items: center;
    gap: var(--sv-space-6);
    height: 24px;
    padding: 0 var(--sv-space-8);
    font: inherit;
    font-weight: var(--sv-font-weight-bold);
    color: var(--sv-text-primary);
    background: none;
    border: 0;
    cursor: pointer;
  }
  .run:hover { background: var(--sv-surface-hover); }
  .glyph { color: var(--sv-accent-fill); font-size: var(--sv-font-size-10); }
  footer {
    display: flex;
    align-items: center;
    gap: var(--sv-space-12);
    padding: 0 var(--sv-space-12);
    font-size: var(--sv-font-size-10);
    border-top: var(--sv-border-1) solid var(--sv-rule-default);
  }
  footer.error { color: var(--sv-signal-error); }
  .running { color: var(--sv-accent-fill); }
  .muted { color: var(--sv-text-muted); }
</style>
