<script lang="ts">
  // Empty state: a few demos playing in small, so what svertik does is visible before choosing.
  // Each tile renders its own scene; slow ones lower their frame rate, and with "reduce motion" they hold
  // a single frame. Clicking a tile opens the demo.
  import { onMount } from 'svelte';
  import { builtins, createEngine, renderInto, sampleScene, type SceneV1 } from '@svertik/engine';
  import { DEMOS, type DemoName } from './demo-catalog';

  let { ondemo }: { ondemo: (which: DemoName) => void } = $props();

  const FEATURED: DemoName[] = ['title', 'playground', 'orrery', 'shatter'];
  const tiles = FEATURED.map((which) => {
    const demo = DEMOS.find((d) => d.which === which)!;
    const project = demo.create() as { canvas?: string; scene: SceneV1 };
    return { which, title: demo.title, description: demo.description, label: `${demo.title}: ${demo.description}`, scene: project.scene, canvas: project.canvas };
  });
  let svgs = $state<SVGSVGElement[]>([]);

  onMount(() => {
    const engine = createEngine(builtins);
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Per tile: the time between frames, raised when a frame is expensive (never more than ~1/3 of the time drawing).
    const gap = tiles.map(() => 66);
    const last = tiles.map(() => -Infinity);
    const start = performance.now();
    let raf = 0;

    function draw(i: number, now: number) {
      const tile = tiles[i]!;
      const svg = svgs[i];
      if (!svg) return;
      const duration = tile.scene.animation?.duration ?? 3;
      const t = reduce ? Math.min(1, duration / 2) : (((now - start) / 1000) % duration);
      const t0 = performance.now();
      try {
        const geometry = engine.evaluateDocument(sampleScene(tile.scene, t)).geometry;
        renderInto(svg, geometry);
        svg.setAttribute('viewBox', geometry.viewBox.join(' '));
      } catch {
        svg.replaceChildren();
      }
      gap[i] = Math.max(66, (performance.now() - t0) * 3);
      last[i] = now;
    }

    function frame(now: number) {
      // One tile per frame at most, so the start screen never stutters.
      const due = tiles.map((_, i) => i).filter((i) => now - last[i]! >= gap[i]!).sort((a, b) => last[a]! - last[b]!)[0];
      if (due !== undefined) draw(due, now);
      raf = requestAnimationFrame(frame);
    }

    if (reduce) tiles.forEach((_, i) => draw(i, start));
    else raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  });
</script>

<ul class="reel" aria-label="Demos">
  {#each tiles as tile, i (tile.which)}
    <li>
      <button type="button" class="tile" title={tile.label} aria-label={`Open demo: ${tile.label}`} onclick={() => ondemo(tile.which)}>
        <svg bind:this={svgs[i]} style:background={tile.canvas || undefined} aria-hidden="true"></svg>
        <span class="title">{tile.title}</span>
        <span class="description">{tile.description}</span>
      </button>
    </li>
  {/each}
</ul>

<style>
  .reel { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--sv-space-8); width: 100%; margin: 0; padding: var(--sv-space-12) 0; list-style: none; }
  .tile {
    display: grid;
    gap: var(--sv-space-4);
    width: 100%;
    padding: 0;
    font: inherit;
    color: var(--sv-text-secondary);
    text-align: left;
    background: none;
    border: 0;
    cursor: pointer;
  }
  svg { display: block; width: 100%; aspect-ratio: 16 / 9; background: var(--sv-surface-field); border: var(--sv-border-1) solid var(--sv-rule-default); }
  .tile:hover svg, .tile:focus-visible svg { border-color: var(--sv-accent-fill); }
  .tile:hover .title, .tile:focus-visible .title { color: var(--sv-accent-fill); }
  .tile:focus-visible { outline: none; }
  .title { font-size: var(--sv-font-size-11); font-weight: var(--sv-font-weight-bold); }
  .description { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); line-height: 1.35; }
  @media (max-width: 480px) { .reel { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
