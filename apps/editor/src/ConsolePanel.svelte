<script lang="ts">
  import { t } from '@svertik/ui';
  import { IconButton, formulaField } from '@svertik/ui';
  import { formatBytes } from './debug-report';
  import { consoleState, evaluateInScene, formatValue, sceneScope, type ConsoleEval } from './console.svelte';
  import Autocomplete from './Autocomplete.svelte';
  import TextZoom from './TextZoom.svelte';
  import { COMMANDS, commandOf } from './console-commands';
  import { highlightFormula } from './formula-highlight';
  import type { Editor } from './editor.svelte';

  // The console: what the editor reports (errors and warnings) and expressions tried against the scene, in one
  // stream like a browser's, with live expressions pinned on top. A performance measurement is one more entry.

  interface Entry {
    id: number;
    level: 'error' | 'warning';
    source: string;
    message: string;
    time: number;
    stack?: string;
  }
  interface Activity { time: number; action: string; detail?: string }
  interface SceneSummary {
    nodes: number;
    byKind: Record<string, number>;
    maximumDepth: number;
    modifiers: number;
    animationTracks: number;
    keyframes: number;
    textShapes: number;
    textCharacters: number;
    importedSvgs: number;
    importedSvgBytes: number;
    svgElements: number;
    svgPaths: number;
    svgPathCommands: number;
    svgImages: number;
  }
  interface SvgSummary {
    bytes: number;
    elements: number;
    paths: number;
    pathCommands: number;
    images: number;
    embeddedImages: number;
    externalImageReferences: number;
    filters: number;
    masks: number;
    clipPaths: number;
    gradients: number;
    uses: number;
    analysisSkipped: boolean;
  }
  interface ProfileView {
    running: boolean;
    samples: number[];
    frame: number;
    total: number;
    totalFrames: number;
    fps: number;
    duration: number;
  }
  let { editor, dock, ondock, entries, sceneSummary, latestSvg, activities, profile, maximized, onmaximize, onclose, onclear, oncopy, report, onbundle, onprofile }: {
    editor: Editor;
    /** Where the panel is: below the canvas, or a column on the right. */
    dock: 'bottom' | 'right';
    ondock: (dock: 'bottom' | 'right') => void;
    entries: Entry[];
    sceneSummary: SceneSummary | null;
    latestSvg: SvgSummary | null;
    activities: Activity[];
    profile: ProfileView;
    maximized: boolean;
    onmaximize: () => void;
    onclose: () => void;
    onclear: () => void;
    oncopy: (text: string, what: string) => void | boolean | Promise<void | boolean>;
    report: () => string;
    onbundle: (includeProject: boolean) => void;
    onprofile: () => void;
  } = $props();

  const timeOf = (time: number) => new Date(time).toLocaleTimeString();
  let includeProject = $state(false);
  const profileMax = $derived(Math.max(50, Math.ceil(Math.max(0, ...profile.samples) / 25) * 25));
  const profilePath = $derived.by(() => {
    const n = profile.samples.length;
    return profile.samples.map((ms, i) => `${i ? 'L' : 'M'}${4 + (n > 1 ? i / (n - 1) * 992 : 0)} ${90 - Math.min(1, ms / profileMax) * 78}`).join(' ');
  });
  const profileStats = $derived.by(() => {
    if (!profile.samples.length) return null;
    const sorted = [...profile.samples].sort((a, b) => a - b);
    return {
      average: profile.samples.reduce((sum, ms) => sum + ms, 0) / profile.samples.length,
      p95: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]!,
      peak: sorted.at(-1)!,
    };
  });

  // When the current measurement started, to place it in the stream.
  let profileAt = $state(0);
  $effect(() => { if (profile.running) profileAt = Date.now(); });
  let input = $state('');
  let field = $state<HTMLInputElement>();
  let output = $state<HTMLDivElement>();
  /** ↑/↓ through what was typed: -1 is the line being written. */
  let back = -1;
  let draft = '';

  type Line = { kind: 'log'; time: number; id: string; entry: Entry } | { kind: 'eval'; time: number; id: string; entry: ConsoleEval } | { kind: 'profile'; time: number; id: string };
  const stream = $derived<Line[]>([
    ...entries.map((entry) => ({ kind: 'log' as const, time: entry.time, id: `log-${entry.id}`, entry })),
    ...consoleState.evals.map((entry) => ({ kind: 'eval' as const, time: entry.time, id: `eval-${entry.id}`, entry })),
    ...(profile.running || profile.samples.length ? [{ kind: 'profile' as const, time: profileAt, id: 'profile' }] : []),
  ].sort((a, b) => a.time - b.time));
  // The pinned expressions, again whenever the scene, the time or the selection change (playing, too).
  const live = $derived(consoleState.pinned.map((source) => ({ source, result: evaluateInScene(source, editor.scene, editor.time, editor.selected) })));

  function run() {
    const source = input.trim();
    if (!source) return;
    const command = commandOf(source);
    if (command?.def.name === 'clear') clearAll();
    else consoleState.run(source, command ? command.def.run(command.args, editor) : evaluateInScene(source, editor.scene, editor.time, editor.selected));
    input = '';
    back = -1;
    requestAnimationFrame(() => output?.scrollTo({ top: output.scrollHeight }));
  }
  function key(e: KeyboardEvent) {
    e.stopPropagation();
    const typed = consoleState.typed;
    if (e.key === 'Enter') { e.preventDefault(); run(); }
    else if (e.key === 'ArrowUp' && typed.length) {
      e.preventDefault();
      if (back === -1) draft = input;
      back = Math.min(typed.length - 1, back + 1);
      input = typed[typed.length - 1 - back]!;
    } else if (e.key === 'ArrowDown' && back >= 0) {
      e.preventDefault();
      back--;
      input = back === -1 ? draft : typed[typed.length - 1 - back]!;
    }
  }
  const reuse = (source: string) => { input = source; field?.focus(); };
  const clearAll = () => { onclear(); consoleState.clear(); };
  // What suggestions can offer here: other objects' values and the selection's, at the editor's time.
  const completionScope = () => {
    const scene = editor.scene;
    if (!scene) return { scene: null };
    const scope = sceneScope(scene, editor.time, editor.selected);
    return { scene, objects: scope.objects, self: scope.self ? Object.keys(scope.self) : undefined, commands };
  };
  // Commands are offered at the start of the line, with their arguments as the signature.
  const commands = COMMANDS.map((c) => ({ label: `${c.name}(${c.args})`, insert: c.args ? `${c.name}(` : `${c.name}()`, detail: c.about() }));
  const commandNames = new Set(COMMANDS.map((c) => c.name));
  const total = $derived(entries.length + consoleState.evals.length);
</script>

{#snippet measurement()}
  <article class="measurement">
    <div class="summary" aria-label={t('Current scene complexity')}>
      {#if sceneSummary}
        <span>{sceneSummary.nodes} nodes</span>
        <span>{sceneSummary.modifiers} modifiers</span>
        <span>{sceneSummary.animationTracks} tracks · {sceneSummary.keyframes} keys</span>
        {#if sceneSummary.importedSvgs}<span>{sceneSummary.importedSvgs} SVG · {formatBytes(sceneSummary.importedSvgBytes)}</span>{/if}
      {:else}<span>{t('No scene loaded')}</span>{/if}
      {#if latestSvg}<span class="last-svg">Last SVG: {latestSvg.analysisSkipped ? 'structure scan skipped' : `${latestSvg.elements.toLocaleString()} elements · ${latestSvg.pathCommands.toLocaleString()} path commands`}; {formatBytes(latestSvg.bytes)} · {latestSvg.images} images · {latestSvg.filters} filters</span>{/if}
    </div>
    {#if profile.running || profile.samples.length}
      <section class="profile" aria-label={t('Frame render performance')}>
        <div class="profile-meta">
          <strong>Frame work (ms) · {profile.duration.toFixed(2)} s at {profile.fps} fps</strong>
          {#if profile.running}
            <span>{profile.frame}/{profile.total} samples{profile.total < profile.totalFrames ? ` of ${profile.totalFrames} frames` : ''}</span>
          {:else if profileStats}
            <span>avg {profileStats.average.toFixed(1)} ms · p95 {profileStats.p95.toFixed(1)} ms · peak {profileStats.peak.toFixed(1)} ms</span>
          {/if}
        </div>
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={t('Frame render time in milliseconds across the scene')}>
          <line x1="4" x2="996" y1="90" y2="90" />
          {#if profileMax >= 16.7}<line class="budget" x1="4" x2="996" y1={90 - 16.7 / profileMax * 78} y2={90 - 16.7 / profileMax * 78} />{/if}
          {#if profileMax >= 50}<line class="warning" x1="4" x2="996" y1={90 - 50 / profileMax * 78} y2={90 - 50 / profileMax * 78} />{/if}
          {#if profilePath}<path class="trace" d={profilePath} />{/if}
        </svg>
        <div class="profile-axis"><span>0 s</span><span>{profile.duration.toFixed(2)} s</span><span>16.7 ms target · 50 ms threshold · scale 0–{profileMax} ms</span></div>
      </section>
    {/if}
  </article>
{/snippet}

<section class="console" data-dock={dock} aria-label={t('Console')}>
  <header>
    <h2>{t('Console')}</h2>{#if total}<span class="count">{total}</span>{/if}
    <span class="spacer"></span>
    <TextZoom value={editor.textZoom} onchange={(v) => editor.setTextZoom(v)} />
    <IconButton icon="stopwatch" label={profile.running ? t('Stop performance profile') : t('Measure one scene playback')} active={profile.running} disabled={!sceneSummary} onclick={onprofile} />
    <IconButton icon="trash" label={t('Clear the console')} disabled={!total} onclick={clearAll} />
    <IconButton icon={dock === 'right' ? 'dock-bottom' : 'dock-right'} label={dock === 'right' ? t('Dock the console below the canvas') : t('Dock the console on the right')} onclick={() => ondock(dock === 'right' ? 'bottom' : 'right')} />
    {#if dock === 'bottom'}<IconButton icon={maximized ? 'restore' : 'maximize'} label={maximized ? t('Restore editor layout') : t('Use all available space for the console')} aria-pressed={maximized} onclick={onmaximize} />{/if}
    <IconButton icon={dock === 'right' ? 'close' : 'down'} label={t('Close the console')} onclick={onclose} />
  </header>
    <!-- One surface, like a browser's console: pinned live expressions, the stream, and the line to type on at its end.
         A click on an empty spot goes to that line. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="shell sv-writing-theme" data-sv-theme="dark" style:font-size={`${11 * editor.textZoom / 100}px`} bind:this={output} onclick={(e) => { if (!(e.target as HTMLElement).closest('button, a, input, details, output, .error, span')) field?.focus(); }}>
      {#if live.length}
        <ul class="live" aria-label={t('Live expressions')}>
          {#each live as item (item.source)}
            <li>
              <button type="button" class="source fx-code" title={t('Copy it to the input line')} onclick={() => reuse(item.source)}>{@html highlightFormula(item.source)}</button>
              {#if item.result.error}<span class="error">{item.result.error}</span>{:else}<output>{item.result.value === undefined ? '' : formatValue(item.result.value)}</output>{/if}
              <IconButton icon="close" label={t('Unpin {expression}', { expression: item.source })} onclick={() => consoleState.unpin(item.source)} />
            </li>
          {/each}
        </ul>
      {/if}
      <div role="log" aria-live="polite">
        {#each stream as line (line.id)}
          {#if line.kind === 'log'}
            {@const entry = line.entry}
            <article data-level={entry.level}>
              <time>{timeOf(entry.time)}</time>
              <strong>{entry.level === 'error' ? 'Error' : 'Warning'} · {entry.source}</strong>
              <span>{entry.message}</span>
              {#if entry.stack}<details><summary>{t('Call stack')}</summary><pre>{entry.stack}</pre></details>{/if}
            </article>
          {:else if line.kind === 'profile'}
            {@render measurement()}
          {:else}
            {@const entry = line.entry}
            <article class="eval" data-level={entry.result.error ? 'error' : undefined}>
              <button type="button" class="source fx-code" title={t('Copy it to the input line')} onclick={() => reuse(entry.input)}><i>›</i>{@html highlightFormula(entry.input, commandNames, !!commandOf(entry.input))}</button>
              {#if entry.result.error}<span class="error">{entry.result.error}</span>{:else if entry.result.value !== undefined}<output>{formatValue(entry.result.value)}</output>{:else if entry.result.message}<pre class="message">{entry.result.message}</pre>{/if}
            </article>
          {/if}
        {/each}
      </div>
      <form class="prompt" onsubmit={(e) => { e.preventDefault(); run(); }}>
        <i aria-hidden="true">›</i>
        <input bind:this={field} bind:value={input} aria-label={t('Expression to evaluate')} placeholder={stream.length ? '' : t('scene.time, sin(scene.time) * 100, this.radius, scene.object.… then Enter')} spellcheck="false" autocomplete="off"
          use:formulaField={{ label: t('Console'), noExpand: true, value: input, commit: (next) => (input = next) }}
          onkeydown={key} />
        {#if input.trim()}<IconButton icon="pin" label={t('Pin it on top, updated as the scene plays')} onclick={() => { consoleState.pin(input); input = ''; }} />{/if}
      </form>
      <Autocomplete {field} label={t('Console')} scope={completionScope} />
    </div>
  <footer>
    <span class="activity" title={activities.map((event) => `${timeOf(event.time)} · ${event.action}${event.detail ? ` · ${event.detail}` : ''}`).join('\n')}>
      {#if activities.length}{activities.at(-1)?.action}{activities.at(-1)?.detail ? ` · ${activities.at(-1)?.detail}` : ''}{:else}No recent activity{/if}
    </span>
    {#if dock === 'right'}
      <!-- A narrow column: the same three as icons, with their names as tooltips. -->
      <IconButton icon="document" label={`${t('Include project')} · ${t('Adds the current project, including artwork, SVG source, notes and script.')}`} active={includeProject} aria-pressed={includeProject} onclick={() => (includeProject = !includeProject)} />
      <IconButton icon="copy" label={t('Copy report')} onclick={() => oncopy(report(), t('Debug report'))} />
      <IconButton icon="export" label={t('Download report')} onclick={() => onbundle(includeProject)} />
    {:else}
      <label title={t('Adds the current project, including artwork, SVG source, notes and script.')}>
        <input type="checkbox" bind:checked={includeProject} /> {t('Include project')}
      </label>
      <button type="button" class="download" onclick={() => oncopy(report(), t('Debug report'))}>{t('Copy report')}</button>
      <button type="button" class="download" onclick={() => onbundle(includeProject)}>{t('Download report')}</button>
    {/if}
  </footer>
</section>

<style>
  .console {
    display: flex;
    flex-direction: column;
    gap: var(--sv-space-6);
    min-height: 0;
    padding: var(--sv-space-8);
    color: var(--sv-text-primary);
    background: var(--sv-surface-panel);
    border-top: var(--sv-border-1) solid var(--sv-rule-default);
    font-family: var(--sv-font-mono);
    font-size: var(--sv-font-size-11);
  }
  header { display: flex; align-items: center; gap: var(--sv-space-8); }
  .count, time { color: var(--sv-text-muted); font-variant-numeric: tabular-nums; }
  .spacer { flex: 1; }
  .summary { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sv-space-4) var(--sv-space-12); color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .last-svg { flex-basis: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .profile { flex: none; min-height: 0; padding: 4px 6px 2px; background: var(--sv-surface-field); border: var(--sv-border-1) solid var(--sv-rule-default); }
  .profile-meta { display: flex; justify-content: space-between; gap: 8px; min-width: 0; color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .profile-meta strong, .profile-meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .profile-meta strong { color: var(--sv-text-primary); font-weight: var(--sv-font-weight-medium); }
  .profile-meta span { font-variant-numeric: tabular-nums; }
  .profile svg { display: block; width: 100%; height: clamp(34px, 7vh, 64px); overflow: visible; }
  .profile line { stroke: var(--sv-rule-strong); stroke-width: 1; vector-effect: non-scaling-stroke; }
  .profile line.budget { stroke: var(--sv-accent-text); stroke-dasharray: 3 5; opacity: 0.55; }
  .profile line.warning { stroke: var(--sv-signal-warning); stroke-dasharray: 3 5; opacity: 0.65; }
  .profile .trace { fill: none; stroke: var(--sv-accent-text); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  .profile-axis { display: flex; gap: 10px; color: var(--sv-text-muted); font-size: 9px; font-variant-numeric: tabular-nums; }
  .profile-axis span:last-child { margin-left: auto; }
  .shell {
    position: relative;
    min-width: 0;
    color: var(--sv-text-primary);
    flex: 1;
    min-height: 40px;
    overflow: hidden auto;
    padding: var(--sv-space-6);
    background: var(--sv-surface-field);
    border: var(--sv-border-1) solid var(--sv-rule-default);
    cursor: text;
  }
  .shell [role='log'] > :global(* + *) { margin-top: var(--sv-space-4); }
  article { display: grid; grid-template-columns: max-content max-content minmax(0, 1fr); gap: var(--sv-space-8); align-items: baseline; line-height: 1.5; }
  article + article { margin-top: var(--sv-space-4); }
  article[data-level='error'] strong { color: var(--sv-signal-error); }
  article[data-level='warning'] strong { color: var(--sv-signal-warning); }
  article span { min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  details { grid-column: 1 / -1; color: var(--sv-text-muted); }
  summary { cursor: pointer; }
  pre { margin: var(--sv-space-4) 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  footer { display: flex; align-items: center; gap: var(--sv-space-8); min-width: 0; }
  .activity { flex: 1; min-width: 0; overflow: hidden; color: var(--sv-text-muted); text-overflow: ellipsis; white-space: nowrap; }
  footer label { display: flex; align-items: center; gap: var(--sv-space-4); white-space: nowrap; cursor: pointer; }
  footer input { accent-color: var(--sv-accent-fill); }
  .download { flex: none; height: 22px; padding: 0 var(--sv-space-8); color: var(--sv-text-primary); background: var(--sv-surface-panel); border: var(--sv-border-1) solid var(--sv-rule-strong); font: inherit; cursor: pointer; }
  .download:hover { border-color: var(--sv-accent-fill); }
  .console[data-dock='right'] { min-width: 0; height: 100%; border-top: 0; border-left: var(--sv-border-1) solid var(--sv-rule-default); }
  .live { position: sticky; top: calc(-1 * var(--sv-space-6)); z-index: 1; margin: calc(-1 * var(--sv-space-6)) calc(-1 * var(--sv-space-6)) var(--sv-space-6); padding: 2px var(--sv-space-6); list-style: none; background: var(--sv-surface-panel); border-bottom: var(--sv-border-1) solid var(--sv-rule-default); }
  .live li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 8px; min-height: 22px; }
  .live li + li { border-top: var(--sv-border-1) solid var(--sv-rule-default); }
  output { color: var(--sv-code-number); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .error { color: var(--sv-signal-error); overflow-wrap: anywhere; }
  .source { min-width: 0; padding: 0; overflow: hidden; color: var(--sv-code-property); background: none; border: 0; border-radius: 0; font: inherit; text-align: left; text-overflow: ellipsis; white-space: pre-wrap; overflow-wrap: anywhere; cursor: pointer; }
  .source i, .prompt i { padding-right: 6px; font-style: normal; color: var(--sv-text-muted); }
  article.eval { grid-template-columns: minmax(0, 1fr) auto; }
  article.eval .error, article.eval .message { grid-column: 1 / -1; }
  .message { margin: 0; color: var(--sv-text-secondary); white-space: pre-wrap; }
  .prompt { display: flex; align-items: center; gap: 4px; margin-top: var(--sv-space-4); }
  .prompt i { color: var(--sv-accent-text); }
  .prompt input { flex: 1; min-width: 0; height: 20px; padding: 0; color: var(--sv-text-primary); background: none; border: 0; outline: none; font: inherit; }
  h2 { flex: none; margin: 0; font-size: var(--sv-font-size-11); }
  article.measurement { display: flex; flex-direction: column; gap: 4px; margin: 4px 0; }
  .fx-code :global(.fx-function) { color: var(--sv-code-keyword); }
  .fx-code :global(.fx-number) { color: var(--sv-code-number); }
  .fx-code :global(.fx-string) { color: var(--sv-code-string); }
  .fx-code :global(.fx-operator), .fx-code :global(.fx-depth-0) { color: var(--sv-code-punctuation); }
  .fx-code :global(.fx-depth-1) { color: var(--sv-code-keyword); }
  .fx-code :global(.fx-depth-2) { color: var(--sv-code-number); }
  .fx-code :global(.fx-unknown) { text-decoration: underline wavy var(--sv-signal-error); text-underline-offset: 3px; }
  @media (max-width: 760px) {
    article { grid-template-columns: max-content minmax(0, 1fr); }
    article span { grid-column: 1 / -1; }
  }
</style>
