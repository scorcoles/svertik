<script lang="ts">
  import { IconButton, NumberField } from '@svertik/ui';
  import type { Editor } from './editor.svelte';

  let { editor }: { editor: Editor } = $props();
  const duration = $derived(editor.animation?.duration ?? 3);
  const fps = $derived(editor.animation?.fps ?? 30);
  function seek(time: number) {
    editor.playing = false;
    editor.setTime(time);
  }
</script>

<div class="time-controls" role="group" aria-label="Playback controls">
  <IconButton icon="to-start" label="Go to start" onclick={() => seek(0)} />
  <IconButton icon={editor.playing ? 'pause' : 'play'} label={editor.playing ? 'Pause animation' : 'Play animation'} active={editor.playing} onclick={() => editor.togglePlayback()} />
  <input
    class="scrubber"
    type="range"
    aria-label="Animation time"
    aria-valuetext={`${editor.time.toFixed(2)} seconds`}
    min="0"
    max={duration}
    step={1 / fps}
    value={editor.time}
    oninput={(event) => seek(event.currentTarget.valueAsNumber)}
  />
  <NumberField label="Current time" value={editor.time} min={0} max={duration} step={1 / fps} unit="s" width="64px" onchange={seek} />
  <span class="separator" aria-hidden="true">/</span>
  <NumberField label="Animation duration" value={duration} min={0.1} step={0.1} unit="s" width="58px" onchange={(value) => editor.setDuration(value)} />
</div>

<style>
  .time-controls { display: flex; align-items: center; gap: var(--sv-space-4); color: var(--sv-text-secondary); }
  .time-controls :global(.sv-icon-button) { width: 22px; height: 22px; }
  .time-controls :global(.sv-icon) { width: 13px; height: 13px; }
  .scrubber { appearance: none; width: clamp(64px, 9vw, 140px); height: 22px; margin: 0 var(--sv-space-4); padding: 0; background: transparent; cursor: ew-resize; }
  .scrubber::-webkit-slider-runnable-track { height: 2px; background: var(--sv-rule-strong); }
  .scrubber::-moz-range-track { height: 2px; background: var(--sv-rule-strong); }
  .scrubber::-webkit-slider-thumb { appearance: none; width: 6px; height: 6px; margin-top: -2px; border: 0; border-radius: 50%; background: var(--sv-text-muted); transition: background 120ms, box-shadow 120ms; }
  .scrubber::-moz-range-thumb { width: 6px; height: 6px; border: 0; border-radius: 50%; background: var(--sv-text-muted); transition: background 120ms, box-shadow 120ms; }
  .scrubber:hover::-webkit-slider-thumb, .scrubber:focus-visible::-webkit-slider-thumb { background: var(--sv-accent-fill); box-shadow: 0 0 0 2px var(--sv-accent-selection); }
  .scrubber:hover::-moz-range-thumb, .scrubber:focus-visible::-moz-range-thumb { background: var(--sv-accent-fill); box-shadow: 0 0 0 2px var(--sv-accent-selection); }
  .scrubber:focus-visible { outline: 1px solid var(--sv-accent-fill); outline-offset: 2px; }
  .separator { color: var(--sv-text-disabled); }
</style>
