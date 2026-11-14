<script lang="ts">
  import { IconButton } from '@svertik/ui';
  import CopyButton from './CopyButton.svelte';

  interface Entry {
    id: number;
    level: 'error' | 'warning';
    source: string;
    message: string;
    time: number;
  }
  let { entries, maximized, onmaximize, onclose, onclear, oncopy }: {
    entries: Entry[];
    maximized: boolean;
    onmaximize: () => void;
    onclose: () => void;
    onclear: () => void;
    oncopy: (text: string, what: string) => void | boolean | Promise<void | boolean>;
  } = $props();

  const timeOf = (time: number) => new Date(time).toLocaleTimeString();
</script>

<section class="diagnostics" aria-labelledby="diagnostics-title">
  <header>
    <h2 id="diagnostics-title">Debug output</h2>
    <span class="count">{entries.length}</span>
    <span class="spacer"></span>
    <IconButton icon="trash" label="Clear diagnostic output" disabled={!entries.length} onclick={onclear} />
    <IconButton icon={maximized ? 'restore' : 'maximize'} label={maximized ? 'Restore editor layout' : 'Use all available space for diagnostics'} aria-pressed={maximized} onclick={onmaximize} />
    <IconButton icon="down" label="Close diagnostics panel" onclick={onclose} />
  </header>
  <div class="output" role="log" aria-live="polite">
    <CopyButton label="Copy diagnostic output" disabled={!entries.length} onclick={() => oncopy(entries.map((entry) => `[${timeOf(entry.time)}] ${entry.level.toUpperCase()} · ${entry.source}: ${entry.message}`).join('\n'), 'Diagnostics')} />
    {#if entries.length}
      {#each entries as entry (entry.id)}
        <article data-level={entry.level}>
          <time>{timeOf(entry.time)}</time>
          <strong>{entry.level === 'error' ? 'Error' : 'Warning'} · {entry.source}</strong>
          <span>{entry.message}</span>
        </article>
      {/each}
    {:else}
      <p>No errors or warnings.</p>
    {/if}
  </div>
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
  p { margin: 0; color: var(--sv-text-muted); }
  @media (max-width: 760px) {
    article { grid-template-columns: max-content minmax(0, 1fr); }
    article span { grid-column: 1 / -1; }
  }
</style>
