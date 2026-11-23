<script lang="ts">
  import { IconButton } from '@svertik/ui';
  import TextZoom from './TextZoom.svelte';
  import CopyButton from './CopyButton.svelte';
  import { hasTextExpressions } from '@svertik/engine';
  import { onMount } from 'svelte';
  import type { ShapeNode } from '@svertik/engine';
  import type { Editor } from './editor.svelte';
  let { editor, node, maximized = false, onmaximize, onclose, oncopy }: { editor: Editor; node: ShapeNode; maximized?: boolean; onmaximize?: () => void; onclose?: () => void; oncopy?: (text: string, what: string) => void | boolean | Promise<void | boolean> } = $props();
  function close() { editor.flush(); editor.textFxNode = null; onclose?.(); }
  let field: HTMLTextAreaElement;
  const presets = [
    { label: 'Time', text: '{{fixed(scene.time, 2)}}', tip: 'Elapsed time with two decimal places' },
    { label: 'Countdown', text: '{{scene.countDown(10)}}', tip: 'Count down from ten seconds' },
    { label: 'Frame', text: '{{scene.frame}}', tip: 'Current animation frame' },
    { label: 'Cycle', text: '{{scene.cycle}}', tip: 'Completed duration windows' },
    { label: 'Clock', text: '{{fixed(floor(scene.clock.hour), 0, 2)}}:{{fixed(floor(scene.clock.minute), 0, 2)}}:{{fixed(floor(scene.clock.second), 0, 2)}}', tip: 'Local clock in Play; exports use zero' },
    { label: 'Progress', text: '{{round(scene.progress * 100)}}%', tip: 'Timeline progress as a percentage' },
    { label: 'Clicks', text: '{{scene.mouse.clicks}}', tip: 'Primary clicks in Play' },
  ];
  function insert(text: string) {
    const value = String(node.params.text ?? '');
    const start = field?.selectionStart ?? value.length, end = field?.selectionEnd ?? start;
    editor.setShapeParam(node.id, 'text', value.slice(0, start) + text + value.slice(end));
    field?.focus({ preventScroll: true });
    requestAnimationFrame(() => field?.setSelectionRange(start + text.length, start + text.length));
  }
  onMount(() => field?.focus({ preventScroll: true }));
</script>
<section class="text-fx" aria-label="Text expressions">
  <header><strong>Text ƒx</strong><span>{node.name}</span>
    <TextZoom value={editor.textZoom} onchange={(v) => editor.setTextZoom(v)} />
    <button type="button" disabled={!hasTextExpressions(node.params.text) || editor.isLocked(node.id)} title="Keep the evaluated text at the current time; Undo restores the expressions" onclick={() => { if (editor.convertTextToPlain(node.id)) close(); }}>Convert to plain text</button>
    {#if onmaximize}<IconButton icon={maximized ? 'restore' : 'maximize'} label={maximized ? 'Restore editor layout' : 'Use all available space for text expressions'} aria-pressed={maximized} onclick={onmaximize} />{/if}
    <IconButton icon="down" label="Close text expressions" onclick={close} />
  </header>
  <div class="body">
    <div class="template-editor">
    <textarea bind:this={field} style:font-size={`${11 * editor.textZoom / 100}px`} class="sv-writing-theme" data-sv-theme="dark" aria-label="Text expression template" spellcheck="false" value={String(node.params.text ?? '')} oninput={(e) => editor.setShapeParam(node.id, 'text', e.currentTarget.value)} onblur={() => editor.flush()} onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Escape') { close(); } }}></textarea>
    <CopyButton label="Copy text template" disabled={!node.params.text || !oncopy} onclick={() => oncopy?.(String(node.params.text ?? ''), 'Text template')} />
    </div>
    <aside>
      <div class="presets" role="group" aria-label="Insert a text preset">{#each presets as preset}<button type="button" title={preset.tip} onpointerdown={(e) => e.preventDefault()} onclick={() => insert(preset.text)}>{preset.label}</button>{/each}</div>
      <p>Mix ordinary text with expressions inside <code>{'{{…}}'}</code>. Select text to replace it with a preset.</p>
      <p><code>{'{{fixed(scene.time, 2)}}'}</code> formats decimals. Use <code>scene.custom.name</code> for document variables.</p>
      <p>Clock renders as 00:00:00 in this canvas. Open Play to see local time.</p>
      <p>Mouse and clock values update in Play. Scene time follows playback; Infinite keeps it running.</p>
    </aside>
  </div>
</section>
<style>
  .text-fx { display: flex; flex-direction: column; min-height: 0; background: var(--sv-surface-panel); color: var(--sv-text-primary); border-top: 1px solid var(--sv-rule-default); font: 11px var(--sv-font-mono); }
  header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 4px 8px; }
  header span { flex: 1; color: var(--sv-text-muted); }
  .body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 35%); gap: 8px; min-height: 0; flex: 1; padding: 0 8px 8px; }
  .template-editor { position: relative; min-height: 0; }
  textarea { height: 100%; resize: none; width: 100%; min-height: 0; padding: 8px; font: inherit; line-height: 1.5; border: 1px solid var(--sv-rule-default); background: var(--sv-surface-field); color: var(--sv-text-primary); }
  aside { overflow: auto; }
  .presets { display: flex; flex-wrap: wrap; gap: 4px; }
  button { border: 1px solid var(--sv-rule-strong); border-radius: 0; color: var(--sv-text-primary); background: var(--sv-surface-panel); font: inherit; padding: 4px 6px; cursor: pointer; }
  button:hover { border-color: var(--sv-accent-fill); }
  p { color: var(--sv-text-muted); line-height: 1.5; margin: 8px 0; }
  code { color: var(--sv-text-secondary); font: inherit; }
</style>
