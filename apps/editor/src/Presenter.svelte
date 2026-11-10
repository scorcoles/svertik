<script lang="ts">
  // Modo Play: la escena a pantalla completa, sin herramientas, sobre el color del lienzo. Usa el mismo
  // reproductor que el código exportado (línea de tiempo, hover, clic, enter, «reducir movimiento»):
  // lo que se ve aquí es lo que verá la web. Esc (o la ×) vuelve al editor.
  import { builtins, createEngine, createPlayer, type SceneV2 } from '@svertik/engine';
  import { onMount } from 'svelte';
  import type { Editor } from './editor.svelte';

  let { editor }: { editor: Editor } = $props();
  let svg = $state<SVGSVGElement>();
  let hint = $state(true);

  onMount(() => {
    const scene = $state.snapshot(editor.scene) as SceneV2;
    const player = svg ? createPlayer(createEngine(builtins), svg, scene) : null;
    const t = setTimeout(() => (hint = false), 2200);
    return () => {
      clearTimeout(t);
      player?.stop();
    };
  });
  const close = () => (editor.presenting = false);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<div class="presenter" role="dialog" aria-label="Play" style:background={editor.canvas || '#0b0b0b'}>
  <svg bind:this={svg} class="stage" aria-label="svertik scene"></svg>
  <button type="button" class="close" onclick={close} aria-label="Back to the editor (Esc)" title="Back to the editor (Esc)">×</button>
  <p class="hint" data-hidden={!hint || undefined}>Esc to go back to the editor</p>
</div>

<style>
  .presenter { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; }
  .stage { width: min(92vw, 100%); height: 92vh; overflow: visible; }
  .close {
    position: absolute;
    top: var(--sv-space-12);
    right: var(--sv-space-12);
    width: 28px;
    height: 28px;
    font: inherit;
    font-size: 16px;
    color: var(--sv-text-secondary);
    background: rgb(0 0 0 / 0.35);
    border: var(--sv-border-1) solid var(--sv-rule-default);
    cursor: pointer;
    opacity: 0.4;
    transition: opacity 150ms;
  }
  .close:hover, .close:focus-visible { opacity: 1; }
  .hint {
    position: absolute;
    bottom: var(--sv-space-16);
    margin: 0;
    padding: var(--sv-space-4) var(--sv-space-8);
    color: var(--sv-text-secondary);
    background: rgb(0 0 0 / 0.4);
    font-size: var(--sv-font-size-10);
    transition: opacity 400ms;
  }
  .hint[data-hidden] { opacity: 0; }
</style>
