<script lang="ts">
  import { t } from '@svertik/ui';
  import { builtins, createEngine, validateScene, type SceneNode, type SceneV1 } from '@svertik/engine';
  import { IconButton, Tabs } from '@svertik/ui';
  import CopyButton from './CopyButton.svelte';
  import TextZoom from './TextZoom.svelte';
  import CodeEditor from './CodeEditor.svelte';
  import { exportJS, extractScript, jsDocument, sourceRanges, syntaxErrorLine } from './code';
  import type { Editor } from './editor.svelte';
  import { sceneJSON } from './exporters';
  import { Runner } from './runner';

  interface Props {
    editor: Editor;
    oncopy: (text: string, what: string) => void | boolean | Promise<void | boolean>;
    maximized: boolean;
    onmaximize: () => void;
    ondiagnostic: (source: string, level: 'error' | 'warning', message: string, stack?: string) => void;
    onactivity: (action: string, detail?: string) => void;
  }
  let { editor, oncopy, maximized, onmaximize, ondiagnostic, onactivity }: Props = $props();

  const engine = createEngine(builtins);
  let tab = $state('JSON');
  let error = $state<{ message: string; line: number | null; stack?: string } | null>(null);
  let cursor = $state<[number, number]>([1, 1]);

  const snapshot = () => $state.snapshot(editor.scene) as SceneV1;
  const frame = () => {
    const s = snapshot();
    s.at = editor.time;
    return s;
  };
  const jsonDoc = $derived(editor.scene ? sceneJSON(editor.scene) : '');
  const jsDoc = $derived(editor.scene ? jsDocument($state.snapshot(editor.scene) as SceneV1, editor.script) : '');
  const jsFold = $derived(sourceRanges(jsDoc));
  // In the JSON, SVGs go on one long line: they fold too.
  const jsonFold = $derived([...jsonDoc.matchAll(/"source": "/g)].map((m) => {
    const from = m.index! + m[0].length;
    let i = from;
    while (i < jsonDoc.length && jsonDoc[i] !== '"') i += jsonDoc[i] === '\\' ? 2 : 1;
    return [from, i] as [number, number];
  }));

  // Flat SVG: computed only with its tab open and at most five times a second.
  let svgDoc = $state('');
  let svgTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (tab !== 'SVG' || !editor.scene) return;
    const scene = frame();
    if (editor.preview) scene.objects = $state.snapshot(editor.preview) as SceneNode[];
    clearTimeout(svgTimer);
    svgTimer = setTimeout(() => (svgDoc = engine.toSVG(scene)), 200);
  });

  // ── Validating what comes from the code

  // Errors: not applied. Warnings (misspelt parameters, tracks pointing nowhere): applied and reported.
  let warnings = $state<string[]>([]);
  function validate(s: unknown): SceneV1 {
    const report = validateScene(s, builtins);
    if (report.errors.length) throw new Error(report.errors[0]);
    warnings = report.warnings;
    return s as SceneV1;
  }

  // ── JSON editable

  let jsonTimer: ReturnType<typeof setTimeout> | undefined;
  function onJSON(text: string) {
    clearTimeout(jsonTimer);
    jsonTimer = setTimeout(() => {
      try {
        editor.applyScene(validate(JSON.parse(text)));
        error = null;
        onactivity('Applied JSON scene');
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const pos = /position (\d+)/.exec(message);
        const line = pos ? text.slice(0, Number(pos[1])).split('\n').length : null;
        error = { message, line, stack: e instanceof Error ? e.stack : undefined };
      }
    }, 300);
  }

  // ── JS: runs in a worker

  const runner = new Runner((m) => {
    if (m.type === 'scene') {
      try {
        editor.applyScene(validate(m.scene));
        error = null;
        onactivity('Applied JavaScript scene');
      } catch (e) {
        error = { message: e instanceof Error ? e.message : String(e), line: null, stack: e instanceof Error ? e.stack : undefined };
      }
      runner.idle();
    } else {
      error = { message: m.message, line: m.line ?? (tab === 'JS' ? syntaxErrorLine(lastRun) : null), stack: m.stack };
    }
  });

  /** The scene in `text` if it is JSON rather than JavaScript: a bare scene or a project file. */
  function asJSONScene(text: string): unknown {
    if (!text.trimStart().startsWith('{')) return null;
    try {
      const value = JSON.parse(text) as { svertik?: unknown; scene?: unknown } | null;
      return value && value.svertik === 'project' ? value.scene : value;
    } catch {
      return null;
    }
  }

  let jsTimer: ReturnType<typeof setTimeout> | undefined;
  let lastRun = '';
  function onJS(text: string) {
    clearTimeout(jsTimer);
    jsTimer = setTimeout(() => {
      // A scene or project pasted as plain JSON (a recipe, an export) is applied as it is, as in the JSON tab.
      const json = asJSONScene(text);
      if (json) {
        try {
          editor.applyScene(validate(json));
          error = null;
          onactivity('Applied JSON scene');
        } catch (e) {
          error = { message: e instanceof Error ? e.message : String(e), line: null, stack: e instanceof Error ? e.stack : undefined };
        }
        return;
      }
      editor.setScript(extractScript(text));
      lastRun = text;
      runner.run(text);
    }, 400);
  }

  $effect(() => () => {
    runner.kill();
    editor.preview = null;
  });

  async function copy(): Promise<boolean> {
    if (!editor.scene) return false;
    if (tab === 'JSON') return (await oncopy(jsonDoc, 'JSON')) !== false;
    if (tab === 'JS') return (await oncopy(exportJS(snapshot(), editor.script), 'JS')) !== false;
    return (await oncopy(engine.toSVG(frame()), 'SVG')) !== false;
  }

  const hints: Record<string, string> = { JSON: 'scene · editable', JS: 'scene + onFrame', SVG: t('flat output · read-only') };

  $effect(() => {
    if (error) ondiagnostic(t('Code'), 'error', `${error.line ? `Line ${error.line}: ` : ''}${error.message}`, error.stack);
    for (const warning of warnings) ondiagnostic(t('Code'), 'warning', warning);
  });
</script>

<section class="code-panel" aria-label={t('Code')} style:--code-font-size={`${11 * editor.textZoom / 100}px`}>
  <Tabs bind:value={tab} tabs={['JSON', 'JS', 'SVG']}>
    {#snippet children(tab)}
      <div class="body">
        {#if tab === 'JSON'}
          <CodeEditor value={jsonDoc} lang="json" label={t('Scene JSON')} fold={jsonFold} errorLine={error?.line ?? null} onchange={onJSON} oncursor={(l, c) => (cursor = [l, c])} />
        {:else if tab === 'JS'}
          <CodeEditor value={jsDoc} lang="js" label={t('Scene and script')} fold={jsFold} errorLine={error?.line ?? null} onchange={onJS} oncursor={(l, c) => (cursor = [l, c])} />
        {:else}
          <CodeEditor value={svgDoc} lang="svg" label={t('Flat SVG')} readonly oncursor={(l, c) => (cursor = [l, c])} />
        {/if}
        <CopyButton label={t('Copy {what}', { what: tab })} onclick={copy} />
      </div>
    {/snippet}
  </Tabs>
  <div class="head-extra">
    {#if editor.showInfo}<span class="hint">{hints[tab]}</span>{/if}
    <span class="spacer"></span>
    <TextZoom value={editor.textZoom} onchange={(v) => editor.setTextZoom(v)} />
    <IconButton
      icon={maximized ? 'restore' : 'maximize'}
      label={maximized ? t('Restore editor layout') : t('Use all available space for code')}
      aria-pressed={maximized}
      onclick={onmaximize}
    />
    <IconButton icon="down" label={t('Close code panel')} onclick={() => (editor.codeOpen = false)} />
  </div>
  <footer class:error={!!error}>
    {#if error}
      <span>{error.line ? `Line ${error.line}: ` : ''}{error.message}</span>
    {:else if warnings.length}
      <span class="warning" title={warnings.join('\n')}>⚠ {warnings[0]}{warnings.length > 1 ? ` (+${warnings.length - 1} more)` : ''}</span>
    {:else}
      <span class="muted">{tab === 'SVG' ? t('Read-only.') : t('Scene changes apply live. onFrame animations run in exported JS.')}</span>
    {/if}
    <span class="spacer"></span>
    <span class="muted">{t('Ln {line}, Col {column}', { line: cursor[0], column: cursor[1] })}</span>
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
  .body { position: relative; height: 100%; min-height: 0; }
  .body:hover :global(.copy) { opacity: 1; }
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
