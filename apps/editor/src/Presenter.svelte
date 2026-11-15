<script lang="ts">
  // Modo Play: la escena a pantalla completa, sin herramientas, sobre el color del lienzo. Usa el mismo
  // reproductor que el código exportado (línea de tiempo, hover, clic, enter, «reducir movimiento»):
  // lo que se ve aquí es lo que verá la web. Esc (o la ×) vuelve al editor.
  import { builtins, createEngine, createPlayer, type SceneV2 } from '@svertik/engine';
  import { onMount } from 'svelte';
  import { Icon } from '@svertik/ui';
  import { DEFAULT_CANVAS, type Editor } from './editor.svelte';
  import { createFpsMeter, type FpsMeter } from './fpsmeter';

  let { editor }: { editor: Editor } = $props();
  let svg = $state<SVGSVGElement>();
  let hint = $state(true);
  let controlsVisible = $state(false);
  let controlsTimer: ReturnType<typeof setTimeout> | undefined;
  let meter: FpsMeter | null = null;

  onMount(() => {
    const scene = $state.snapshot(editor.scene) as SceneV2;
    meter = createFpsMeter(document.body);
    const player = svg ? createPlayer(createEngine(builtins), svg, scene, { onFrame: ({ ms }) => meter?.frame(ms) }) : null;
    const t = setTimeout(() => (hint = false), 2200);
    return () => {
      clearTimeout(t);
      clearTimeout(controlsTimer);
      player?.stop();
      meter?.stop();
    };
  });
  const close = () => (editor.presenting = false);
  function revealControls() {
    controlsVisible = true;
    clearTimeout(controlsTimer);
    controlsTimer = setTimeout(() => (controlsVisible = false), 1500);
  }

  // Compartir: el enlace que abre esta escena en Play. En el móvil, el menú de compartir del sistema.
  let said = $state<string | null>(null);
  let sayTimer: ReturnType<typeof setTimeout> | undefined;
  const say = (text: string) => {
    said = text;
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => (said = null), 2400);
  };
  async function share() {
    const url = await editor.shareURL();
    if (!url) return say('Too big for a link: save the project (.svrtk) and send the file');
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: editor.name, url });
        return;
      } catch {
        // Cancelado: no pasa nada.
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      say('Link copied: it opens this scene in Play');
    } catch {
      say('Could not copy the link');
    }
  }
</script>

<svelte:window
  onpointermove={revealControls}
  onkeydown={(e) => {
    if (e.key === 'Escape') close();
    // D: el medidor de rendimiento.
    else if (e.key.toLowerCase() === 'd' && !e.metaKey && !e.ctrlKey) meter?.toggle();
  }}
/>

<div class="presenter" role="dialog" aria-label="Play" style:background={editor.canvas || DEFAULT_CANVAS}>
  <svg bind:this={svg} class="stage" aria-label="svertik scene"></svg>
  <div class="tools" data-active={controlsVisible || undefined}>
    <button type="button" onclick={share} aria-label="Share a link to this scene" title="Share a link to this scene">
      <Icon name="share" />
    </button>
    <button type="button" onclick={close} aria-label="Back to the editor (Esc)" title="Back to the editor (Esc)"><Icon name="close" /></button>
  </div>
  <p class="hint" data-hidden={(!hint && !said) || undefined} aria-live="polite">{said ?? 'Esc to go back to the editor · D for performance'}</p>
</div>

<style>
  .presenter { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; }
  .stage { width: min(92vw, 100%); height: 92vh; overflow: visible; }
  .tools {
    position: absolute;
    top: max(16px, env(safe-area-inset-top));
    right: max(16px, env(safe-area-inset-right));
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px;
    color: rgb(255 255 255 / 0.76);
    background: rgb(24 25 24 / 0.9);
    border: 1px solid rgb(255 255 255 / 0.14);
    border-radius: 5px;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.12);
    backdrop-filter: blur(12px);
    transition: background 180ms, border-color 180ms;
  }
  .tools[data-active], .tools:focus-within {
    background: rgb(24 25 24 / 0.97);
    border-color: rgb(255 255 255 / 0.24);
  }
  .tools button {
    position: relative;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    color: inherit;
    background: transparent;
    border: 0;
    border-radius: 2px;
    cursor: pointer;
    transition: color 140ms, background 140ms;
  }
  .tools button + button::before {
    content: '';
    position: absolute;
    left: -5px;
    top: 9px;
    bottom: 9px;
    width: 1px;
    background: rgb(255 255 255 / 0.16);
  }
  .tools button:hover { color: #fff; background: rgb(255 255 255 / 0.09); }
  .tools button:active { background: rgb(255 255 255 / 0.16); }
  .tools button:focus-visible { outline: 2px solid var(--sv-accent-fill, #09fdd1); outline-offset: 1px; }
  .tools :global(.sv-icon) { width: 16px; height: 16px; }
  @media (pointer: coarse) {
    .tools button { width: 40px; height: 40px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .tools, .tools button { transition: none; }
  }
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
