<script lang="ts">
  import type { Snippet } from 'svelte';
  import { scrub as scrubValue } from './scrub';

  interface Props {
    label: string;
    /** id del control, para asociar la etiqueta. */
    for?: string;
    /** Fila que crece con su control (cuadros de texto), en vez de la altura fija de una línea. */
    tall?: boolean;
    /** Animación: rombo a la izquierda (sin animar, animado o con clave en este instante). */
    keyState?: 'none' | 'animated' | 'key';
    onkey?: () => void;
    scrub?: { value: number; step: number; min?: number; max?: number; onchange: (value: number) => void };
    children?: Snippet;
  }
  let { label, for: htmlFor, tall = false, keyState, onkey, scrub, children }: Props = $props();
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
  <label for={htmlFor} data-scrubbable={!!scrub || undefined} onpointerdown={scrubDown} onpointermove={scrubMove} onpointerup={scrubUp} onpointercancel={scrubUp}>{label}</label>
  <div class="control">{@render children?.()}</div>
</div>

<style>
  .sv-param { position: relative; }
  /* Rombo de animación: vacío (sin animar), contorno turquesa (animado), relleno (clave aquí). */
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
    border: 1px solid var(--sv-text-disabled);
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
    height: var(--sv-size-row);
    padding: 0 var(--sv-space-8);
  }
  .sv-param[data-keyed] label { padding-left: var(--sv-space-8); }
  .sv-param[data-tall] { height: auto; align-items: flex-start; padding-top: var(--sv-space-4); padding-bottom: var(--sv-space-4); }
  .sv-param[data-tall] label { padding-top: var(--sv-space-2); }
  label {
    flex: none;
    width: 84px;
    text-align: right;
    color: var(--sv-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  label[data-scrubbable] { cursor: ew-resize; user-select: none; }
  .control { flex: 1; display: flex; align-items: center; gap: var(--sv-space-8); min-width: 0; }
</style>
