<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    /** id del control, para asociar la etiqueta. */
    for?: string;
    /** Fila que crece con su control (cuadros de texto), en vez de la altura fija de una línea. */
    tall?: boolean;
    /** Animación: rombo a la izquierda (sin animar, animado o con clave en este instante). */
    keyState?: 'none' | 'animated' | 'key';
    onkey?: () => void;
    children?: Snippet;
  }
  let { label, for: htmlFor, tall = false, keyState, onkey, children }: Props = $props();
</script>

<div class="sv-param" data-tall={tall || undefined}>
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
  <label for={htmlFor}>{label}</label>
  <div class="control">{@render children?.()}</div>
</div>

<style>
  .sv-param { position: relative; }
  /* Rombo de animación: vacío (sin animar), contorno turquesa (animado), relleno (clave aquí). */
  .key {
    position: absolute;
    left: 6px;
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
  .control { flex: 1; display: flex; align-items: center; gap: var(--sv-space-8); min-width: 0; }
</style>
