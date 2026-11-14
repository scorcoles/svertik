<script lang="ts">
  import { IconButton } from '@svertik/ui';
  import CopyButton from './CopyButton.svelte';
  import { formatBytes } from './debug-report';

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
  let { entries, sceneSummary, latestSvg, activities, maximized, onmaximize, onclose, onclear, oncopy, report, onbundle }: {
    entries: Entry[];
    sceneSummary: SceneSummary | null;
    latestSvg: SvgSummary | null;
    activities: Activity[];
    maximized: boolean;
    onmaximize: () => void;
    onclose: () => void;
    onclear: () => void;
    oncopy: (text: string, what: string) => void | boolean | Promise<void | boolean>;
    report: () => string;
    onbundle: (includeProject: boolean) => void;
  } = $props();

  const timeOf = (time: number) => new Date(time).toLocaleTimeString();
  let includeProject = $state(false);
</script>

<section class="diagnostics" aria-labelledby="diagnostics-title">
  <header>
    <h2 id="diagnostics-title">Debug output</h2>
    <span class="count">{entries.length}</span>
    <span class="spacer"></span>
    <span class="copy-slot"><CopyButton label="Copy debug report" onclick={() => oncopy(report(), 'Debug report')} /></span>
    <IconButton icon="trash" label="Clear diagnostic output" disabled={!entries.length} onclick={onclear} />
    <IconButton icon={maximized ? 'restore' : 'maximize'} label={maximized ? 'Restore editor layout' : 'Use all available space for diagnostics'} aria-pressed={maximized} onclick={onmaximize} />
    <IconButton icon="down" label="Close diagnostics panel" onclick={onclose} />
  </header>
  <div class="summary" aria-label="Current scene complexity">
    {#if sceneSummary}
      <span>{sceneSummary.nodes} nodes</span>
      <span>{sceneSummary.modifiers} modifiers</span>
      <span>{sceneSummary.animationTracks} tracks · {sceneSummary.keyframes} keys</span>
      {#if sceneSummary.importedSvgs}<span>{sceneSummary.importedSvgs} SVG · {formatBytes(sceneSummary.importedSvgBytes)}</span>{/if}
    {:else}<span>No scene loaded</span>{/if}
    {#if latestSvg}<span class="last-svg">Last SVG: {latestSvg.analysisSkipped ? 'structure scan skipped' : `${latestSvg.elements.toLocaleString()} elements · ${latestSvg.pathCommands.toLocaleString()} path commands`}; {formatBytes(latestSvg.bytes)} · {latestSvg.images} images · {latestSvg.filters} filters</span>{/if}
  </div>
  <div class="output" role="log" aria-live="polite">
    {#if entries.length}
      {#each entries as entry (entry.id)}
        <article data-level={entry.level}>
          <time>{timeOf(entry.time)}</time>
          <strong>{entry.level === 'error' ? 'Error' : 'Warning'} · {entry.source}</strong>
          <span>{entry.message}</span>
          {#if entry.stack}<details><summary>Stack</summary><pre>{entry.stack}</pre></details>{/if}
        </article>
      {/each}
    {:else}
      <p>No errors or warnings.</p>
    {/if}
  </div>
  <footer>
    <span class="activity" title={activities.map((event) => `${timeOf(event.time)} · ${event.action}${event.detail ? ` · ${event.detail}` : ''}`).join('\n')}>
      {#if activities.length}{activities.at(-1)?.action}{activities.at(-1)?.detail ? ` · ${activities.at(-1)?.detail}` : ''}{:else}No recent activity{/if}
    </span>
    <label title="Adds the current project, including artwork, SVG source, notes and script.">
      <input type="checkbox" bind:checked={includeProject} /> Include project
    </label>
    <button type="button" class="download" onclick={() => onbundle(includeProject)}>Download report</button>
  </footer>
</section>

<style>
  .diagnostics {
    display: flex;
    flex-direction: column;
    gap: var(--sv-space-6);
    min-height: 0;
    padding: var(--sv-space-8);
    color: var(--sv-text-primary);
    background: var(--sv-surface-panel);
    border-top: var(--sv-border-1) solid var(--sv-rule-default);
    font-family: var(--sv-font-mono);
    font-size: var(--sv-font-size-10);
  }
  header { display: flex; align-items: center; gap: var(--sv-space-8); }
  h2 { flex: none; margin: 0; font-size: var(--sv-font-size-11); }
  .count, time { color: var(--sv-text-muted); font-variant-numeric: tabular-nums; }
  .spacer { flex: 1; }
  .copy-slot { position: relative; flex: none; width: 56px; height: 22px; }
  .summary { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sv-space-4) var(--sv-space-12); color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .last-svg { flex-basis: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .output {
    position: relative;
    flex: 1;
    min-height: 40px;
    overflow: auto;
    padding: var(--sv-space-32) var(--sv-space-6) var(--sv-space-6);
    background: var(--sv-surface-field);
    border: var(--sv-border-1) solid var(--sv-rule-default);
  }
  article { display: grid; grid-template-columns: max-content max-content minmax(0, 1fr); gap: var(--sv-space-8); align-items: baseline; line-height: 1.5; }
  article + article { margin-top: var(--sv-space-4); }
  article[data-level='error'] strong { color: var(--sv-signal-error); }
  article[data-level='warning'] strong { color: var(--sv-signal-warning, #ffd166); }
  article span { min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  details { grid-column: 1 / -1; color: var(--sv-text-muted); }
  summary { cursor: pointer; }
  pre { margin: var(--sv-space-4) 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  p { margin: 0; color: var(--sv-text-muted); }
  footer { display: flex; align-items: center; gap: var(--sv-space-8); min-width: 0; }
  .activity { flex: 1; min-width: 0; overflow: hidden; color: var(--sv-text-muted); text-overflow: ellipsis; white-space: nowrap; }
  footer label { display: flex; align-items: center; gap: var(--sv-space-4); white-space: nowrap; cursor: pointer; }
  footer input { accent-color: var(--sv-accent-fill); }
  .download { flex: none; height: 22px; padding: 0 var(--sv-space-8); color: var(--sv-text-primary); background: var(--sv-surface-panel); border: var(--sv-border-1) solid var(--sv-rule-strong); font: inherit; cursor: pointer; }
  .download:hover { border-color: var(--sv-accent-fill); }
  @media (max-width: 760px) {
    article { grid-template-columns: max-content minmax(0, 1fr); }
    article span { grid-column: 1 / -1; }
  }
</style>
