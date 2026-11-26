<script lang="ts">
  // Presets of the selected effect (or, with `shape`, of the selected generator primitive) as live thumbnails:
  // the selected object with each preset applied. Hover one to see it move; click to apply it. The one the
  // effect or primitive matches now is marked.
  import { t } from '@svertik/ui';
  import { bounds, builtins, createEngine, renderInto, sampleScene, shapeRegistry, walkNodes, type ModifierInstance, type ParamSpec, type SceneNode, type SceneV1 } from '@svertik/engine';
  import { DEFAULT_CANVAS, registry, type Editor } from './editor.svelte';
  import { EFFECT_PRESETS, PRESET_ZOOM, SHAPE_PRESETS, keptByShapes, matchesPreset, presetValues, type EffectPreset } from './effect-presets';

  let { editor, shape = false }: { editor: Editor; shape?: boolean } = $props();

  // An engine of its own: thumbnails must not disturb the canvas's caches or live worlds.
  const engine = createEngine(builtins);
  /** Still thumbnails show this moment, so presets that grow with time (a crack, a blast) are seen. */
  const STILL = 1.2;
  /** Hovered thumbnails loop over this many seconds. */
  const LOOP = 4;

  const m = $derived(shape ? null : editor.current);
  /** The generator primitive (shape mode): the selected object, if it is one. */
  const primitive = $derived.by(() => { const n = shape ? editor.currentNode : null; return n?.kind === 'shape' ? n : null; });
  const presets = $derived(m ? EFFECT_PRESETS[m.type] ?? [] : primitive ? SHAPE_PRESETS[primitive.shape] ?? [] : []);
  const schema = $derived((m ? registry.get(m.type)?.params ?? {} : primitive ? shapeRegistry.get(primitive.shape)?.params ?? {} : {}) as Record<string, ParamSpec>);
  const values = $derived(((m ?? primitive)?.params ?? {}) as Record<string, unknown>);
  const keep = $derived(primitive ? keptByShapes : undefined);
  const active = $derived(presets.findIndex((p) => matchesPreset(schema, values, p, keep)));

  let tiles = $state<SVGSVGElement[]>([]);
  let failed = $state<boolean[]>([]);

  /** The selected object alone, at time `at`, with this effect set to the preset (and centred). */
  function sceneFor(preset: EffectPreset, at: number): SceneV1 | null {
    const scene = editor.scene, owner = primitive ?? editor.activeNode, effect = m;
    if (!scene || !owner || (!effect && !primitive)) return null;
    const sampled = sampleScene($state.snapshot(scene) as SceneV1, at);
    const found = [...walkNodes(sampled.objects)].find(({ node }) => node.id === owner.id)?.node;
    if (!found) return null;
    const node = structuredClone(found) as SceneNode;
    if (primitive && node.kind === 'shape') node.params = presetValues(schema, node.params as Record<string, unknown>, preset, keep) as typeof node.params;
    const swap = (list: ModifierInstance[] | undefined): ModifierInstance[] | undefined => list?.map((inst) =>
      inst.id === effect?.id ? { ...inst, enabled: true, params: presetValues(schema, (inst.params ?? {}) as Record<string, unknown>, preset) } : { ...inst, ...(inst.children ? { children: swap(inst.children) } : {}) });
    node.stack = swap(node.stack) ?? [];
    node.transform = { ...node.transform, x: 0, y: 0 };
    node.visible = true;
    return { version: 1, objects: [node], ...(sampled.custom ? { custom: sampled.custom } : {}), ...(sampled.seedGenerator !== undefined ? { seedGenerator: sampled.seedGenerator } : {}), at } as SceneV1;
  }

  function draw(i: number, at: number) {
    const el = tiles[i], preset = presets[i];
    if (!el || !preset) return;
    try {
      const scene = sceneFor(preset, at);
      if (!scene) return;
      const geometry = engine.evaluateDocument(scene).geometry;
      renderInto(el, geometry);
      // Fine detail: a close-up of the middle of the drawing (a square, so it fills the tile).
      const zoom = m ? PRESET_ZOOM[m.type] : undefined;
      if (zoom) {
        const b = bounds(geometry), side = Math.max(b.width, b.height) * zoom;
        if (side > 0) el.setAttribute('viewBox', [b.x + b.width / 2 - side / 2, b.y + b.height / 2 - side / 2, side, side].join(' '));
      }
      failed[i] = false;
    } catch {
      failed[i] = true;
    }
  }

  // Still thumbnails: redrawn when the object changes (this effect's own values aside, which the presets
  // replace), a moment after the last change so dragging a value elsewhere doesn't redraw them each step.
  const objectKey = $derived.by(() => {
    const owner = primitive ?? editor.activeNode, effect = m;
    if (!owner || (!effect && !primitive)) return '';
    const copy = $state.snapshot(owner) as SceneNode;
    const blank = (list: ModifierInstance[] | undefined): unknown => list?.map((inst) => inst.id === effect?.id ? { id: inst.id } : { ...inst, children: blank(inst.children) });
    // A primitive's presets replace its own values (its style aside, which they keep).
    const params = primitive ? Object.fromEntries(Object.entries(copy.kind === 'shape' ? copy.params : {}).filter(([name]) => keptByShapes(name, schema[name] ?? ({} as ParamSpec)))) : undefined;
    return JSON.stringify([effect?.type ?? primitive?.shape, { ...copy, transform: undefined, stack: blank(copy.stack), ...(params ? { params } : {}) }, editor.fontsTick]);
  });
  $effect(() => {
    void objectKey; void presets;
    const timer = setTimeout(() => presets.forEach((_, i) => { if (i !== hovered) draw(i, STILL); }), 200);
    return () => clearTimeout(timer);
  });

  // Hover: that thumbnail plays.
  let hovered = -1;
  let frame = 0;
  function enter(i: number) {
    hovered = i;
    cancelAnimationFrame(frame);
    const start = performance.now();
    const tick = () => {
      if (hovered !== i) return;
      draw(i, ((performance.now() - start) / 1000) % LOOP);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }
  function leave(i: number) {
    if (hovered !== i) return;
    hovered = -1;
    cancelAnimationFrame(frame);
    draw(i, STILL);
  }
  $effect(() => () => cancelAnimationFrame(frame));

  function apply(preset: EffectPreset) {
    const next = presetValues(schema, $state.snapshot(values) as Record<string, unknown>, preset, keep);
    editor.flush();
    if (primitive) editor.setShapeParams(primitive.id, next);
    else if (m) for (const [name, value] of Object.entries(next)) editor.setParam(name, value);
    editor.flush();
  }
</script>

{#if presets.length}
  <div class="presets" role="group" aria-label={t('Presets')}>
    {#each presets as preset, i ((m?.type ?? primitive?.shape) + ':' + i)}
      <button type="button" class="preset" data-active={i === active || undefined} title={preset.tip ?? preset.name}
        aria-pressed={i === active} onclick={() => apply(preset)} onpointerenter={() => enter(i)} onpointerleave={() => leave(i)}>
        <svg bind:this={tiles[i]} class="thumb" style:background={editor.canvas || DEFAULT_CANVAS} data-failed={failed[i] || undefined} aria-hidden="true" preserveAspectRatio="xMidYMid meet"></svg>
        <span class="name">{preset.name}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .presets {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
    gap: var(--sv-space-4);
    padding: var(--sv-space-6) var(--sv-space-8) var(--sv-space-8);
  }
  .preset {
    display: flex;
    flex-direction: column;
    gap: var(--sv-space-2);
    min-width: 0;
    padding: var(--sv-space-2);
    font: inherit;
    color: var(--sv-text-secondary);
    background: none;
    border: var(--sv-border-1) solid var(--sv-rule-default);
    border-radius: 0;
    cursor: pointer;
  }
  .preset:hover { color: var(--sv-text-primary); border-color: var(--sv-text-muted); }
  .preset[data-active] { color: var(--sv-accent-text); border-color: var(--sv-accent-fill); }
  .preset:focus-visible { outline: 1px solid var(--sv-accent-text); outline-offset: 1px; }
  /* The thumbnails sit on the canvas's colour: the drawing reads as it does on the canvas. */
  .thumb { display: block; width: 100%; aspect-ratio: 1; padding: 6px; box-sizing: border-box; overflow: hidden; }
  .thumb[data-failed] { opacity: 0.3; }
  .name { overflow: hidden; font-size: var(--sv-font-size-10); text-align: left; text-overflow: ellipsis; white-space: nowrap; }
</style>
