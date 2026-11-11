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
  let meter: FpsMeter | null = null;

  onMount(() => {
    const scene = $state.snapshot(editor.scene) as SceneV2;
    meter = createFpsMeter(document.body);
    const player = svg ? createPlayer(createEngine(builtins), svg, scene, { onFrame: ({ ms }) => meter?.frame(ms) }) : null;
    const t = setTimeout(() => (hint = false), 2200);
    return () => {
      clearTimeout(t);
      player?.stop();
      meter?.stop();
    };
  });
  const close = () => (editor.presenting = false);

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
  onkeydown={(e) => {
    if (e.key === 'Escape') close();
    // D: el medidor de rendimiento.
    else if (e.key.toLowerCase() === 'd' && !e.metaKey && !e.ctrlKey) meter?.toggle();
  }}
/>

<div class="presenter" role="dialog" aria-label="Play" style:background={editor.canvas || DEFAULT_CANVAS}>
  <svg bind:this={svg} class="stage" aria-label="svertik scene"></svg>
  <div class="tools">
    <button type="button" onclick={share} aria-label="Share a link to this scene" title="Share a link to this scene">
      <Icon name="share" />
    </button>
    <button type="button" onclick={close} aria-label="Back to the editor (Esc)" title="Back to the editor (Esc)">×</button>
  </div>
  <p class="hint" data-hidden={(!hint && !said) || undefined} aria-live="polite">{said ?? 'Esc to go back to the editor · D for performance'}</p>
</div>

<style>
  .presenter { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; }
  .stage { width: min(92vw, 100%); height: 92vh; overflow: visible; }
  .tools { position: absolute; top: var(--sv-space-12); right: var(--sv-space-12); display: flex; gap: var(--sv-space-4); }
  .tools button {
    display: grid;
    place-items: center;
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
  .tools button:hover, .tools button:focus-visible { opacity: 1; }
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
