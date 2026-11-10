<script lang="ts">
  // Línea de tiempo: reproducción, regla con cabezal y una pista por parámetro animado con sus claves.
  // Las claves se arrastran (encajan en fotogramas); la seleccionada muestra su easing y se borra con Supr.
  import { EASES, shapeRegistry, type Ease } from '@svertik/engine';
  import { Checkbox, IconButton, NumberField, Select } from '@svertik/ui';
  import { locateNode, locateModifier, registry, type Editor } from './editor.svelte';

  let { editor }: { editor: Editor } = $props();

  const anim = $derived(editor.animation);
  const duration = $derived(anim?.duration ?? 3);
  const fps = $derived(anim?.fps ?? 30);
  let area = $state<HTMLDivElement>();
  let width = $state(400);
  $effect(() => {
    if (!area) return;
    const ro = new ResizeObserver(([e]) => (width = e!.contentRect.width));
    ro.observe(area);
    return () => ro.disconnect();
  });
  const x = (t: number) => (t / duration) * width;
  const snap = (t: number) => Math.round(t * fps) / fps;

  // ── Reproducir
  $effect(() => {
    if (!editor.playing) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const dt = (now - last) / 1000;
      last = now;
      let t = editor.time + dt;
      if (t >= duration) {
        if (anim?.loop !== false) t %= duration;
        else {
          t = duration;
          editor.playing = false;
        }
      }
      editor.setTime(t);
      if (editor.playing) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });
  function togglePlay() {
    if (!editor.playing && editor.time >= duration - 1e-6) editor.setTime(0);
    editor.playing = !editor.playing;
  }

  // ── Cabezal: arrastrar en la regla
  function scrub(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const at = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      editor.setTime(snap(Math.max(0, Math.min(duration, ((ev.clientX - r.left) / r.width) * duration))));
    };
    at(e);
    const up = () => { el.removeEventListener('pointermove', at); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', at);
    el.addEventListener('pointerup', up);
  }

  // ── Claves
  let selected = $state<{ track: string; t: number } | null>(null);
  function dragKey(e: PointerEvent, track: string, t0: number) {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    selected = { track, t: t0 };
    editor.setTime(t0);
    const x0 = e.clientX;
    let cur = t0;
    const move = (ev: PointerEvent) => {
      const t = snap(Math.max(0, Math.min(duration, t0 + ((ev.clientX - x0) / width) * duration)));
      if (t === cur) return;
      editor.moveKey(track, cur, t);
      cur = t;
      selected = { track, t };
      editor.setTime(t);
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }
  const selectedKey = $derived.by(() => {
    if (!selected || !anim) return null;
    const tr = anim.tracks.find((x) => x.id === selected!.track);
    return tr?.keys.find((k) => k.t === selected!.t) ? { tr, key: tr.keys.find((k) => k.t === selected!.t)! } : null;
  });
  function keydown(e: KeyboardEvent) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedKey) {
      e.preventDefault();
      e.stopPropagation();
      editor.removeKey(selectedKey.tr.id, selectedKey.key.t);
      selected = null;
    }
  }

  // ── Nombres de las pistas: «Objeto · Efecto · parámetro»
  function labelOf(tr: { node: string; on: string; modifier?: string; param: string }) {
    const n = editor.scene ? locateNode(editor.scene.objects, tr.node)?.node : undefined;
    const node = n?.name ?? '?';
    if (tr.on === 'node') return { node, what: '', param: tr.param };
    if (tr.on === 'shape') {
      const spec = n && n.kind === 'shape' ? shapeRegistry.get(n.shape)?.params[tr.param] : undefined;
      return { node, what: '', param: spec?.label ?? tr.param };
    }
    const m = editor.scene && tr.modifier ? locateModifier(editor.scene, tr.modifier)?.inst : undefined;
    const def = m ? registry.get(m.type) : undefined;
    return { node, what: def?.label ?? '?', param: def?.params[tr.param]?.label ?? tr.param };
  }
  const ticks = $derived.by(() => {
    const step = duration <= 2 ? 0.25 : duration <= 6 ? 0.5 : duration <= 20 ? 1 : 5;
    return Array.from({ length: Math.floor(duration / step) + 1 }, (_, i) => i * step);
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="timeline" aria-label="Timeline" onkeydown={keydown}>
  <header>
    <IconButton icon="to-start" label="Go to start" onclick={() => editor.setTime(0)} />
    <IconButton icon={editor.playing ? 'pause' : 'play'} label={editor.playing ? 'Pause' : 'Play'} active={editor.playing} onclick={togglePlay} />
    <span class="time">{editor.time.toFixed(2)}<span class="dim"> / {duration.toFixed(2)} s</span></span>
    <span class="rule" aria-hidden="true"></span>
    <label class="field">Duration <NumberField value={duration} min={0.1} step={0.1} unit="s" width="64px" onchange={(v) => editor.setDuration(v)} /></label>
    <label class="field"><Checkbox checked={anim?.loop !== false} label="Loop" onchange={(v) => editor.setLoop(v)} /> Loop</label>
    <label class="field" title="Off: the timeline only moves with “Play the timeline” interactions"><Checkbox checked={anim?.autoplay !== false} label="Autoplay" onchange={(v) => editor.setAutoplay(v)} /> Autoplay</label>
    {#if selectedKey}
      <span class="rule" aria-hidden="true"></span>
      <span class="field">Ease
        <Select value={selectedKey.key.ease ?? 'ease-in-out'} options={EASES} label="Ease" width="104px" onchange={(v) => editor.setEase(selectedKey.tr.id, selectedKey.key.t, v as Ease)} />
      </span>
      <IconButton icon="trash" label="Delete keyframe (Del)" onclick={() => { editor.removeKey(selectedKey.tr.id, selectedKey.key.t); selected = null; }} />
    {/if}
    <span class="spacer"></span>
    <IconButton icon="down" label="Close timeline" onclick={() => { editor.timelineOpen = false; editor.playing = false; }} />
  </header>
  <div class="body">
    <div class="labels">
      <div class="ruler-gap"></div>
      {#each anim?.tracks ?? [] as tr (tr.id)}
        {@const l = labelOf(tr)}
        <div class="label" title={`${l.node}${l.what ? ` · ${l.what}` : ''} · ${l.param}`}>
          <span class="node">{l.node}</span>{#if l.what}<span class="dim"> · {l.what}</span>{/if}<span class="param"> · {l.param}</span>
          <button type="button" class="x" title="Stop animating this" aria-label="Remove track" onclick={() => editor.removeTrack(tr.id)}>×</button>
        </div>
      {/each}
    </div>
    <div class="lanes" bind:this={area}>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="ruler" onpointerdown={scrub}>
        {#each ticks as t (t)}
          <span class="tick" style:left="{x(t)}px">{Number.isInteger(t) ? `${t}s` : ''}</span>
        {/each}
      </div>
      {#each anim?.tracks ?? [] as tr (tr.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="lane" onpointerdown={scrub}>
          {#each tr.keys as k (k.t)}
            <button
              type="button"
              class="key"
              data-selected={selected?.track === tr.id && selected.t === k.t ? '' : undefined}
              data-hold={k.ease === 'hold' || undefined}
              style:left="{x(k.t)}px"
              title={`${k.t.toFixed(2)} s · ${k.ease ?? 'ease-in-out'}`}
              aria-label={`Keyframe at ${k.t.toFixed(2)} seconds`}
              onpointerdown={(e) => dragKey(e, tr.id, k.t)}
            ></button>
          {/each}
        </div>
      {/each}
      {#if !anim?.tracks.length}
        <p class="empty">Click the ◇ next to any value to animate it: it becomes a keyframe here. Move the playhead, change the value, and another keyframe is added.</p>
      {/if}
      <span class="head" style:left="{x(editor.time)}px" aria-hidden="true"></span>
    </div>
  </div>
</section>

<style>
  .timeline { display: flex; flex-direction: column; min-height: 0; background: var(--sv-surface-panel); border-top: var(--sv-border-1) solid var(--sv-rule-default); }
  header { display: flex; align-items: center; gap: var(--sv-space-4); height: 32px; padding: 0 var(--sv-space-8); flex: none; border-bottom: var(--sv-border-1) solid var(--sv-rule-default); }
  .time { min-width: 108px; font-variant-numeric: tabular-nums; color: var(--sv-text-primary); }
  .dim { color: var(--sv-text-muted); }
  .rule { width: 1px; height: 16px; margin: 0 var(--sv-space-6); background: var(--sv-rule-default); }
  .field { display: flex; align-items: center; gap: var(--sv-space-6); color: var(--sv-text-secondary); }
  .spacer { flex: 1; }
  .body { display: grid; grid-template-columns: 220px 1fr; min-height: 0; overflow-y: auto; }
  .labels { border-right: var(--sv-border-1) solid var(--sv-rule-default); }
  .ruler-gap, .ruler { height: 20px; border-bottom: var(--sv-border-1) solid var(--sv-rule-default); }
  .label, .lane { height: 22px; border-bottom: var(--sv-border-1) solid var(--sv-rule-subtle, var(--sv-rule-default)); }
  .label { position: relative; display: flex; align-items: center; padding: 0 var(--sv-space-8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: var(--sv-font-size-10); }
  .label .node { color: var(--sv-text-secondary); }
  .label .param { color: var(--sv-text-primary); }
  .label .x { position: absolute; right: 4px; padding: 0 4px; font: inherit; color: var(--sv-text-muted); background: var(--sv-surface-panel); border: 0; cursor: pointer; visibility: hidden; }
  .label:hover .x { visibility: visible; }
  .label .x:hover { color: var(--sv-signal-error); }
  .lanes { position: relative; min-width: 0; margin: 0 var(--sv-space-12); }
  .ruler { position: relative; cursor: ew-resize; }
  .tick { position: absolute; top: 0; bottom: 0; padding-left: 3px; border-left: 1px solid var(--sv-rule-strong); font-size: var(--sv-font-size-10); color: var(--sv-text-muted); line-height: 20px; }
  .lane { position: relative; cursor: ew-resize; }
  .key {
    position: absolute;
    top: 50%;
    width: 9px;
    height: 9px;
    padding: 0;
    translate: -50% -50%;
    rotate: 45deg;
    background: var(--sv-accent-fill);
    border: 1px solid rgb(0 0 0 / 0.5);
    cursor: grab;
  }
  .key[data-hold] { border-radius: 0; background: var(--sv-text-secondary); }
  .key[data-selected] { outline: 1px solid var(--sv-text-primary); outline-offset: 2px; }
  .head { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--sv-signal-error); pointer-events: none; }
  .head::before { content: ''; position: absolute; top: 0; left: -4px; width: 9px; height: 8px; background: var(--sv-signal-error); clip-path: polygon(0 0, 100% 0, 50% 100%); }
  .empty { margin: var(--sv-space-12) 0; color: var(--sv-text-muted); font-size: var(--sv-font-size-10); max-width: 520px; }
</style>
