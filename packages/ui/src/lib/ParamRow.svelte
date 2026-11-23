<script lang="ts">
  import type { Snippet } from 'svelte';
  import { scrub as scrubValue } from './scrub';

  interface Props {
    label: string;
    /** Control id, to associate the label. */
    for?: string;
    /** A row that grows with its control (text boxes), instead of a fixed one-line height. */
    tall?: boolean;
    /** Animation: a diamond on the left (not animated, animated, or with a key at this time). */
    keyState?: 'none' | 'animated' | 'key';
    onkey?: () => void;
    scrub?: { value: number; step: number; min?: number; max?: number; onchange: (value: number) => void };
    /** Small help tooltip placed beside the row label. */
    info?: string;
    showInfo?: boolean;
    children?: Snippet;
  }
  let { label, for: htmlFor, tall = false, keyState, onkey, scrub, info, showInfo = true, children }: Props = $props();
  let infoOpen = $state(false);
  let scrubStart: { x: number; value: number; pointerId: number } | null = null;
  let scrubMoved = false;
  function scrubDown(e: PointerEvent) {
    if (!scrub || e.button !== 0 || e.target instanceof HTMLElement && e.target.closest('button')) return;
    scrubStart = { x: e.clientX, value: scrub.value, pointerId: e.pointerId };
    scrubMoved = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function scrubMove(e: PointerEvent) {
    if (!scrubStart || !scrub) return;
    const dx = e.clientX - scrubStart.x;
    if (!scrubMoved && Math.abs(dx) < 3) return;
    scrubMoved = true;
    scrub.onchange(scrubValue(scrubStart.value, dx, { step: scrub.step, min: scrub.min, max: scrub.max, coarse: e.shiftKey, fine: e.altKey }));
  }
  function scrubUp(e: PointerEvent) {
    if (!scrubStart) return;
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    scrubStart = null;
  }
</script>

<div class="sv-param" data-tall={tall || undefined} data-keyed={onkey ? true : undefined}>
  {#if onkey}
    <button
      type="button"
      class="key"
      data-state={keyState ?? 'none'}
      title={keyState === 'key' ? 'Remove keyframe here' : keyState === 'animated' ? 'Add keyframe here' : 'Animate: add a keyframe here'}
      aria-label={`${label}: ${keyState === 'key' ? 'remove keyframe' : 'add keyframe'}`}
      onclick={onkey}
    ></button>
  {/if}
  <div class="label-cell">
    <label for={htmlFor} title={label} data-scrubbable={!!scrub || undefined} onpointerdown={scrubDown} onpointermove={scrubMove} onpointerup={scrubUp} onpointercancel={scrubUp}>{label}</label>
    {#if info && showInfo}
      <span class="row-info" role="group" aria-label={`More information about ${label}`} onpointerenter={() => (infoOpen = true)} onpointerleave={() => (infoOpen = false)} onfocusin={() => (infoOpen = true)} onfocusout={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) infoOpen = false;
      }}>
        <button class="info-trigger" type="button" aria-label={`More information about ${label}`} aria-expanded={infoOpen} title={`More information about ${label}`} onclick={() => (infoOpen = !infoOpen)}>i</button>
        {#if infoOpen}<span class="info-popup" role="tooltip">{info}</span>{/if}
      </span>
    {/if}
  </div>
  <div class="control">{@render children?.()}</div>
</div>

<style>
  .sv-param { position: relative; }
  /* Animation diamond: empty (not animated), turquoise outline (animated), filled (key here). */
  .key {
    position: absolute;
    left: 4px;
    top: 50%;
    width: 7px;
    height: 7px;
    padding: 0;
    translate: 0 -50%;
    rotate: 45deg;
    background: none;
    border: 1px solid var(--sv-text-muted);
    cursor: pointer;
    opacity: 0;
  }
  .sv-param:hover .key,
  .key[data-state='animated'],
  .key[data-state='key'],
  .key:focus-visible { opacity: 1; }
  .key:hover { border-color: var(--sv-text-primary); }
  .key[data-state='animated'] { border-color: var(--sv-accent-fill); }
  .key[data-state='key'] { border-color: var(--sv-accent-fill); background: var(--sv-accent-fill); }
  .sv-param[data-tall] .key { top: 12px; }
  .sv-param {
    display: flex;
    align-items: center;
    gap: var(--sv-space-8);
    min-height: var(--sv-size-row);
    padding: 0 var(--sv-space-8);
  }
  .sv-param[data-keyed] .label-cell { padding-left: var(--sv-space-8); }
  .sv-param[data-tall] { height: auto; align-items: flex-start; padding-top: var(--sv-space-4); padding-bottom: var(--sv-space-4); }
  .sv-param[data-tall] label { padding-top: var(--sv-space-2); }
  .label-cell { flex: none; display: flex; align-items: center; justify-content: flex-end; gap: var(--sv-space-4); width: 84px; min-width: 0; }
  .row-info { position: relative; display: inline-flex; flex: none; }
  .info-trigger { display: inline-grid; place-items: center; width: 12px; height: 12px; padding: 0; color: var(--sv-text-secondary); opacity: .5; background: transparent; border: 1px solid currentColor; border-radius: 50%; font: inherit; font-size: 8px; font-weight: 600; line-height: 1; cursor: help; }
  .info-trigger:hover, .info-trigger:focus-visible { color: var(--sv-accent-text); opacity: 1; outline: none; }
  .info-popup { position: absolute; z-index: 1000; top: calc(100% + 6px); left: -4px; width: max-content; max-width: min(300px, 70vw); padding: 8px 10px; color: var(--sv-text-primary); background: var(--sv-surface-panel); border: 1px solid var(--sv-rule-strong); box-shadow: 0 4px 14px rgb(0 0 0 / 28%); font-size: var(--sv-font-size-11); font-weight: 400; line-height: 1.45; white-space: normal; text-align: left; }
  label {
    flex: none;
    width: auto;
    min-width: 0;
    flex: 1;
    text-align: right;
    color: var(--sv-text-secondary);
    /* Long labels wrap to a second line instead of being cut; beyond two lines they end in an ellipsis. */
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
    line-height: 1.15;
    padding-block: 2px;
  }
  label[data-scrubbable] { cursor: ew-resize; user-select: none; }
  .control { flex: 1; display: flex; align-items: center; gap: var(--sv-space-8); min-width: 0; }
</style>
