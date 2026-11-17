<script lang="ts">
  // Modo Play: la escena a pantalla completa, sin herramientas, sobre el color del lienzo. Usa el mismo
  // reproductor que el código exportado (línea de tiempo, hover, clic, enter, «reducir movimiento»):
  // lo que se ve aquí es lo que verá la web. Esc (o la ×) vuelve al editor.
  import { builtins, createEngine, createPlayer, describeSceneVariables, evaluateSceneVariables, installWire, type SceneV1 } from '@svertik/engine';
  import { downloadFrame } from './capture';
  import { onMount } from 'svelte';
  import { Icon } from '@svertik/ui';
  import { DEFAULT_CANVAS, type Editor } from './editor.svelte';
  import { createFpsMeter, type FpsMeter } from './fpsmeter';

  let { editor }: { editor: Editor } = $props();
  let svg = $state<SVGSVGElement>();
  let hint = $state(true);
  let controlsVisible = $state(true);
  let pointerInControlsZone = false;
  let controlsTimer: ReturnType<typeof setTimeout> | undefined;
  let meter: FpsMeter | null = null;
  let wireOn = $state(false);

  onMount(() => {
    const scene = $state.snapshot(editor.scene) as SceneV1;
    let player: ReturnType<typeof createPlayer> | null = null;
    meter = createFpsMeter(document.body, false, { onRenderer: (r) => player?.setRenderer(r) });
    player = svg ? createPlayer(createEngine(builtins), svg, scene, { renderer: 'auto', pointer: () => meter?.visible() ?? false, onFrame: ({ ms, t, pointer, runtime, painted }) => {
      meter?.frame(ms);
      meter?.renderer(painted, player?.renderer() ?? 'auto');
      const values = evaluateSceneVariables(scene, t);
      meter?.variables(describeSceneVariables(values, pointer, runtime), values.custom);
    } }) : null;
    // W: Wire (outlines only), as in the canvas.
    const wire = svg ? installWire(svg, scene, { onChange: (on) => (wireOn = on) }) : null;
    const t = setTimeout(() => (hint = false), 2200);
    const initialControls = setTimeout(() => { if (!pointerInControlsZone) hideControls(); }, 500);
    return () => {
      clearTimeout(t);
      clearTimeout(initialControls);
      clearTimeout(sayTimer);
      clearTimeout(controlsTimer);
      wire?.dispose();
      player?.stop();
      meter?.stop();
    };
  });
  const close = () => (editor.presenting = false);
  function hideControls() {
    controlsVisible = false;
    clearTimeout(controlsTimer);
  }
  function showControls() {
    controlsVisible = true;
    clearTimeout(controlsTimer);
    controlsTimer = setTimeout(hideControls, 1500);
  }
  function trackMovement(e: PointerEvent) {
    if (e.pointerType === 'touch') return;
    const size = window.innerHeight * 0.2;
    const near = e.clientX >= window.innerWidth - size && e.clientY <= size;
    if (near) {
      pointerInControlsZone = true;
      controlsVisible = true;
      clearTimeout(controlsTimer);
    } else if (pointerInControlsZone) {
      pointerInControlsZone = false;
      clearTimeout(controlsTimer);
      controlsTimer = setTimeout(hideControls, 500);
    }
  }

  // Compartir: el enlace que abre esta escena en Play. En el móvil, el menú de compartir del sistema.
  let said = $state<string | null>(null);
  let sayTimer: ReturnType<typeof setTimeout> | undefined;
  const say = (text: string) => {
    said = text;
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => (said = null), 2400);
  };
  let capturing = $state(false);
  async function capture() {
    if (!svg || capturing) return;
    capturing = true;
    try {
      await downloadFrame(svg, editor.canvas || DEFAULT_CANVAS, editor.name);
      say('Frame downloaded');
    } catch {
      say('Could not download the frame.');
    } finally {
      capturing = false;
    }
  }
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
  onpointermove={trackMovement}
  onpointerdown={(e) => { if (e.pointerType === 'touch') showControls(); }}
  onkeydown={(e) => {
    if (e.key === 'Escape') close();
    // D: el medidor de rendimiento.
    else if (e.key.toLowerCase() === 'd' && !e.metaKey && !e.ctrlKey) meter?.toggle();
  }}
/>

<div class="presenter" role="dialog" aria-label="Play" style:background={wireOn ? '#101216' : editor.canvas || DEFAULT_CANVAS}>
  <svg bind:this={svg} class="stage" class:full-viewport={!!editor.viewportFit} aria-label="svertik scene"></svg>
  <div class="tools" data-active={controlsVisible || undefined}>
    <button type="button" onclick={capture} disabled={capturing} aria-label="Download current frame as PNG" title="Download current frame as PNG">
      <Icon name="image" />
    </button>
    <button type="button" onclick={share} aria-label="Share a link to this scene" title="Share a link to this scene">
      <Icon name="share" />
    </button>
    <button type="button" onclick={close} aria-label="Back to the editor (Esc)" title="Back to the editor (Esc)"><Icon name="close" /></button>
  </div>
  <p class="hint" data-hidden={(!hint && !said) || undefined} aria-live="polite">{said ?? 'Esc to go back to the editor · D for debug · W for wire'}</p>
</div>

<style>
  .presenter { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; }
  .stage { width: min(92vw, 100%); height: 92vh; overflow: visible; }
  .stage.full-viewport { width: 100vw; height: 100dvh; overflow: hidden; }
  .tools {
    position: absolute;
    top: max(16px, env(safe-area-inset-top));
    right: max(16px, env(safe-area-inset-right));
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px;
    color: var(--sv-overlay-light-strong);
    background: rgb(24 25 24 / 0.6);
    border: 1px solid var(--sv-overlay-light-soft);
    border-radius: 0;
    backdrop-filter: blur(12px);
    opacity: 0;
    transform: translateY(-6px);
    pointer-events: none;
    transition: opacity 220ms ease, transform 260ms cubic-bezier(0.22, 1, 0.36, 1), background 180ms, border-color 180ms;
  }
  .tools[data-active], .tools:hover, .tools:focus-within {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
    background: rgb(24 25 24 / 0.68);
    border-color: var(--sv-overlay-light);
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
    border-radius: 0;
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
    background: var(--sv-overlay-light);
  }
  .tools button:hover { color: #fff; background: var(--sv-overlay-light-soft); }
  .tools button:disabled { opacity: 0.45; cursor: wait; }
  .tools button:active { background: var(--sv-overlay-light); }
  .tools button:focus-visible { outline: 2px solid var(--sv-accent-fill, #09fdd1); outline-offset: 1px; }
  .tools :global(.sv-icon) { width: 16px; height: 16px; }
  @media (pointer: coarse) {
    .tools button { width: 40px; height: 40px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .tools, .tools button { transition: none; }
    .tools { transform: none; }
  }
  .hint {
    position: absolute;
    bottom: var(--sv-space-16);
    margin: 0;
    padding: var(--sv-space-4) var(--sv-space-8);
    color: var(--sv-overlay-light-strong);
    background: rgb(24 25 24 / 0.6);
    border: 1px solid var(--sv-overlay-light-soft);
    backdrop-filter: blur(12px);
    font-size: var(--sv-font-size-10);
    transition: opacity 400ms, background 180ms, border-color 180ms;
  }
  .hint[data-hidden] { opacity: 0; }
</style>
