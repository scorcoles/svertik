<script lang="ts">
  // Línea de tiempo: reproducción, regla con cabezal y una pista por parámetro animado con sus claves.
  // Las claves se arrastran (encajan en fotogramas); la seleccionada se borra con Supr.
  // Entre dos claves se dibuja la curva del tramo (el easing de la primera); al pulsarla se elige otra.
  import { Popover } from 'bits-ui';
  import { tick } from 'svelte';
  import { EASES, ease, shapeRegistry, walkNodes, type Ease, type Track } from '@svertik/engine';
  import { Checkbox, IconButton, NumberField, Select } from '@svertik/ui';
  import { locateNode, locateModifier, registry, type Editor } from './editor.svelte';

  let { editor }: { editor: Editor } = $props();

  const anim = $derived(editor.animation);
  const duration = $derived(anim?.duration ?? 3);
  const fps = $derived(anim?.fps ?? 30);
  let area = $state<HTMLDivElement>();
  /** Ancho visible de las pistas (sin el margen de los lados). */
  let visible = $state(400);
  const SIDE = 12;
  $effect(() => {
    if (!area) return;
    const ro = new ResizeObserver(([e]) => (visible = Math.max(50, e!.contentRect.width - 2 * SIDE)));
    ro.observe(area);
    return () => ro.disconnect();
  });
  // ── Zoom: 1 = toda la duración a la vista; como mucho, un fotograma = 48 px.
  let zoom = $state(1);
  const maxZoom = $derived(Math.max(1, (48 * duration * fps) / visible));
  const width = $derived(visible * zoom);
  const x = (t: number) => (t / duration) * width;
  /** Cambia el zoom dejando quieto el instante que hay bajo `px` (px desde el borde visible de las pistas). */
  async function zoomTo(next: number, px = visible / 2) {
    if (!area) return;
    const z = Math.min(maxZoom, Math.max(1, next));
    const t = ((area.scrollLeft + px) / width) * duration;
    zoom = z;
    await tick();
    area.scrollLeft = (t / duration) * visible * z - px;
  }
  function wheel(e: WheelEvent) {
    // ⌘ o Ctrl + rueda, o pellizcar en el trackpad (llega igual): zoom hacia el puntero.
    if (!(e.metaKey || e.ctrlKey) || !area) return;
    e.preventDefault();
    const r = area.getBoundingClientRect();
    void zoomTo(zoom * Math.exp(-e.deltaY * 0.01), e.clientX - r.left - SIDE);
  }
  // Reproduciendo con zoom: si el cabezal se sale de la vista, la vista lo sigue.
  $effect(() => {
    const t = editor.time;
    if (!editor.playing || !area || zoom === 1) return;
    const hx = x(t);
    if (hx < area.scrollLeft || hx > area.scrollLeft + visible) area.scrollLeft = hx - visible * 0.1;
  });
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
    // Without this, dragging over the ruler/lanes selects their numbers and labels as text.
    e.preventDefault();
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
    e.preventDefault();
    // En la ventana y no en el rombo: al cambiar de instante, el rombo se vuelve a crear (va por su instante).
    selected = { track, t: t0 };
    editor.setTime(t0);
    const x0 = e.clientX;
    let cur = t0;
    const move = (ev: PointerEvent) => {
      const t = snap(Math.max(0, Math.min(duration, t0 + ((ev.clientX - x0) / width) * duration)));
      if (t === cur) return;
      cur = editor.moveKey(track, cur, t);
      selected = { track, t: cur };
      editor.setTime(cur);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // ── Curvas de los tramos
  /** La curva de un easing en una caja de w × h (con sitio para lo que se pasa de 0 a 1). */
  function curve(name: Ease | undefined, w: number, h: number, pad = 4) {
    if (name === 'hold') return `M0 ${h - pad} H${w} V${pad}`;
    const n = Math.max(8, Math.min(64, Math.round(w / 3)));
    let d = '';
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      d += `${i ? 'L' : 'M'}${(u * w).toFixed(1)} ${(h - pad - ease(name, u) * (h - pad * 2)).toFixed(1)}`;
    }
    return d;
  }
  let easeOpen = $state<string | null>(null);
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

  // ── Repeticiones: lo que duran las claves de una pista y dónde caen sus copias (rombos tenues).
  const span = (tr: Track) => (tr.keys.length ? Math.max(...tr.keys.map((k) => k.t)) - Math.min(...tr.keys.map((k) => k.t)) : 0);
  function ghosts(tr: Track): number[] {
    const repeat = tr.repeat ?? 1;
    const s = span(tr);
    if (repeat === 1 || !(s > 0)) return [];
    const period = Math.max(s, tr.every ?? s, 1e-3);
    const first = Math.min(...tr.keys.map((k) => k.t));
    const out: number[] = [];
    for (let n = 1; (repeat === 0 || n < repeat) && first + n * period <= duration && out.length < 500; n++) {
      for (const k of tr.keys) {
        const t = k.t + n * period;
        if (t <= duration) out.push(t);
      }
    }
    return out;
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
    return { node, what: def?.label ?? '?', param: tr.param === 'enabled' ? 'On' : (def?.params[tr.param]?.label ?? tr.param) };
  }
  // ── Pistas agrupadas por objeto, en el orden del panel Stack; cada grupo se pliega.
  let folded = $state<string[]>([]);
  const groups = $derived.by(() => {
    const tracks = anim?.tracks ?? [];
    if (!editor.scene || !tracks.length) return [];
    const order = [...walkNodes(editor.scene.objects)].map(({ node }) => node);
    const byNode = new Map<string, Track[]>();
    for (const tr of tracks) byNode.set(tr.node, [...(byNode.get(tr.node) ?? []), tr]);
    return order
      .filter((n) => byNode.has(n.id))
      .map((n) => {
        const list = byNode.get(n.id)!;
        // Los instantes con alguna clave del objeto: sus rombos de resumen.
        const times = [...new Set(list.flatMap((tr) => tr.keys.map((k) => k.t)))].sort((a, b) => a - b);
        return { id: n.id, name: n.name, tracks: list, times, open: !folded.includes(n.id) };
      });
  });
  const toggleFold = (id: string) => (folded = folded.includes(id) ? folded.filter((x) => x !== id) : [...folded, id]);

  // Marcas de la regla: las que quepan (una cada 56 px o más), con su etiqueta.
  const tickStep = $derived([1 / fps, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30].find((s) => (s / duration) * width >= 56) ?? 60);
  const ticks = $derived(Array.from({ length: Math.floor(duration / tickStep + 1e-6) + 1 }, (_, i) => Math.round(i * tickStep * 1000) / 1000));
  const tickLabel = (t: number) => (tickStep >= 1 ? `${t}s` : tickStep >= 0.1 ? `${t.toFixed(tickStep >= 0.25 ? 2 : 1).replace(/0$/, '')}s` : `${t.toFixed(2)}s`);
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
      <span class="rule" aria-hidden="true"></span>
      <!-- Repetir la pista entera: cuántas veces (0, sin parar) y cada cuánto (vacío: una detrás de otra). -->
      <label class="field" title="How many times this track plays its keys. 0: until the end">Repeat
        <NumberField value={selectedKey.tr.repeat ?? 1} min={0} step={1} unit="×" width="52px" onchange={(v) => editor.setRepeat(selectedKey.tr.id, v, selectedKey.tr.every)} />
      </label>
      {#if (selectedKey.tr.repeat ?? 1) !== 1}
        <label class="field" title="Seconds from the start of one repeat to the next. Shorter than the keys: back to back">every
          <NumberField value={selectedKey.tr.every ?? span(selectedKey.tr)} min={0} step={0.1} unit="s" width="60px" onchange={(v) => editor.setRepeat(selectedKey.tr.id, selectedKey.tr.repeat ?? 1, v)} />
        </label>
      {/if}
    {/if}
    <span class="spacer"></span>
    <!-- Zoom de la línea de tiempo (también ⌘ + rueda, o pellizcar, sobre las pistas). -->
    <span class="zoom">
      <IconButton icon="minus" label="Zoom out (⌘ + wheel)" disabled={zoom <= 1} onclick={() => zoomTo(zoom / 1.5)} />
      <span class="pct">{Math.round(zoom * 100)}%</span>
      <IconButton icon="plus" label="Zoom in (⌘ + wheel)" disabled={zoom >= maxZoom} onclick={() => zoomTo(zoom * 1.5)} />
      <IconButton icon="fit-width" label="Fit the whole duration" disabled={zoom === 1} onclick={() => zoomTo(1)} />
    </span>
    <IconButton icon="down" label="Close timeline" onclick={() => { editor.timelineOpen = false; editor.playing = false; }} />
  </header>
  <div class="body">
    <div class="labels">
      <!-- Encima de las capas: desplegar y plegar todas. -->
      <div class="ruler-gap">
        {#if groups.length}
          <IconButton icon="expand-all" label="Expand all tracks" onclick={() => (folded = [])} />
          <IconButton icon="collapse-all" label="Collapse all tracks" onclick={() => (folded = groups.map((g) => g.id))} />
        {/if}
      </div>
      {#each groups as g (g.id)}
        <div class="label group" data-selected={editor.activeNode?.id === g.id || undefined}>
          <button type="button" class="fold" aria-expanded={g.open} aria-label={g.open ? `Fold ${g.name}` : `Unfold ${g.name}`} onclick={() => toggleFold(g.id)}>{g.open ? '▾' : '▸'}</button>
          <button type="button" class="name" title={`Select ${g.name}`} onclick={() => (editor.selected = g.id)}>{g.name}</button>
          <span class="dim count">{g.tracks.length}</span>
        </div>
        {#if g.open}
          {#each g.tracks as tr (tr.id)}
            {@const l = labelOf(tr)}
            <div class="label track" title={`${l.node}${l.what ? ` · ${l.what}` : ''} · ${l.param}`}>
              {#if l.what}<span class="dim">{l.what} · </span>{/if}<span class="param">{l.param}</span>{#if (tr.repeat ?? 1) !== 1}<span class="dim" title="Repeats">&nbsp;↻{tr.repeat === 0 ? '' : tr.repeat}</span>{/if}
              <button type="button" class="x" title="Stop animating this" aria-label="Remove track" onclick={() => editor.removeTrack(tr.id)}>×</button>
            </div>
          {/each}
        {/if}
      {/each}
    </div>
    <div class="lanes" bind:this={area} onwheel={wheel}>
      <div class="inner" style:width="{width}px">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="ruler" onpointerdown={scrub}>
        {#each ticks as t (t)}
          <span class="tick" style:left="{x(t)}px">{tickLabel(t)}</span>
        {/each}
      </div>
      {#each groups as g (g.id)}
        <!-- Fila del objeto: un rombo pequeño donde tenga alguna clave (lleva el cabezal a ese instante). -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="lane group" onpointerdown={scrub}>
          {#each g.times as t (t)}
            <button
              type="button"
              class="key summary"
              style:left="{x(t)}px"
              title={`${t.toFixed(2)} s`}
              aria-label={`${g.name}: keyframes at ${t.toFixed(2)} seconds`}
              onpointerdown={(e) => { e.stopPropagation(); editor.setTime(t); }}
            ></button>
          {/each}
        </div>
        {#if g.open}
          {#each g.tracks as tr (tr.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="lane" onpointerdown={scrub}>
          {#each tr.keys.slice(0, -1) as a, i (a.t)}
            {@const b = tr.keys[i + 1]!}
            {@const w = Math.max(1, x(b.t) - x(a.t))}
            {@const id = `${tr.id}@${a.t}`}
            <Popover.Root open={easeOpen === id} onOpenChange={(o) => (easeOpen = o ? id : null)}>
              <Popover.Trigger
                class="segment"
                style="left: {x(a.t)}px; width: {w}px"
                title={`${a.ease ?? 'ease-in-out'} — click to change the ease`}
                aria-label={`Ease from ${a.t.toFixed(2)} to ${b.t.toFixed(2)} s: ${a.ease ?? 'ease-in-out'}`}
                data-on={easeOpen === id || (selected?.track === tr.id && selected.t === a.t) || undefined}
                onpointerdown={(e: PointerEvent) => e.stopPropagation()}
              >
                <svg width={w} height="22" aria-hidden="true"><path d={curve(a.ease, w, 22, 5)} /></svg>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content class="sv-menu ease-menu" sideOffset={4}>
                  {#each EASES as e (e)}
                    <button
                      type="button"
                      class="sv-menu-item ease-item"
                      data-current={(a.ease ?? 'ease-in-out') === e || undefined}
                      onclick={() => { editor.setEase(tr.id, a.t, e); selected = { track: tr.id, t: a.t }; easeOpen = null; }}
                    >
                      <svg width="28" height="18" aria-hidden="true"><path d={curve(e, 28, 18, 3)} /></svg>
                      {e}
                    </button>
                  {/each}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          {/each}
          {#each ghosts(tr) as t, i (i)}
            <span class="key ghost" style:left="{x(t)}px" aria-hidden="true"></span>
          {/each}
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
        {/if}
      {/each}
      {#if !anim?.tracks.length}
        <p class="empty">Click the ◇ next to any value to animate it: it becomes a keyframe here. Move the playhead, change the value, and another keyframe is added.</p>
      {/if}
      <span class="head" style:left="{x(editor.time)}px" aria-hidden="true"></span>
      </div>
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
  .ruler-gap { display: flex; align-items: center; justify-content: flex-end; gap: 2px; padding: 0 var(--sv-space-4); }
  .ruler-gap :global(.sv-icon-button) { width: 16px; height: 16px; }
  .ruler-gap :global(.sv-icon) { width: 12px; height: 12px; }
  .label, .lane { height: 22px; border-bottom: var(--sv-border-1) solid var(--sv-rule-subtle, var(--sv-rule-default)); }
  .label { position: relative; display: flex; align-items: center; padding: 0 var(--sv-space-8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: var(--sv-font-size-10); }
  .label.group { gap: var(--sv-space-4); padding-left: var(--sv-space-4); background: var(--sv-surface-raised); }
  .label.group[data-selected] .name { color: var(--sv-accent-fill); }
  .label.group button { padding: 0; font: inherit; color: var(--sv-text-primary); background: none; border: 0; cursor: pointer; }
  .label.group .fold { width: 14px; color: var(--sv-text-muted); }
  .label.group .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-weight: var(--sv-font-weight-bold); }
  .label.group .count { margin-left: auto; font-size: var(--sv-font-size-10); }
  .label.track { padding-left: 26px; }
  .lane.group { background: rgb(255 255 255 / 0.025); }
  .key.summary { width: 7px; height: 7px; background: var(--sv-text-secondary); cursor: pointer; }
  .label .param { color: var(--sv-text-primary); }
  .label .x { position: absolute; right: 4px; padding: 0 4px; font: inherit; color: var(--sv-text-muted); background: var(--sv-surface-panel); border: 0; cursor: pointer; visibility: hidden; }
  .label:hover .x { visibility: visible; }
  .key.ghost { opacity: 0.3; pointer-events: none; }
  .label .x:hover { color: var(--sv-signal-error); }
  .lanes { position: relative; min-width: 0; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; user-select: none; }
  .inner { position: relative; margin: 0 12px; }
  .zoom { display: flex; align-items: center; gap: 2px; }
  .zoom .pct { min-width: 38px; text-align: center; font-variant-numeric: tabular-nums; color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
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
  :global(.segment) { position: absolute; top: 0; height: 100%; padding: 0; background: none; border: 0; cursor: pointer; overflow: visible; }
  :global(.segment svg) { display: block; overflow: visible; }
  :global(.segment path) { fill: none; stroke: var(--sv-text-muted); stroke-width: 1; opacity: 0.55; }
  :global(.segment:hover path), :global(.segment[data-on] path) { stroke: var(--sv-accent-fill); opacity: 1; }
  :global(.segment:hover) { background: rgb(255 255 255 / 0.03); }
  :global(.ease-menu) { width: 160px; }
  :global(.ease-item) { width: 100%; font: inherit; background: none; border: 0; text-align: left; }
  :global(.ease-item:hover), :global(.ease-item:focus-visible) { background: var(--sv-surface-hover); }
  :global(.ease-item svg) { flex: none; overflow: visible; }
  :global(.ease-item path) { fill: none; stroke: var(--sv-text-secondary); stroke-width: 1.25; }
  :global(.ease-item[data-current]) { color: var(--sv-accent-fill); }
  :global(.ease-item[data-current] path) { stroke: var(--sv-accent-fill); }
  .key[data-hold] { border-radius: 0; background: var(--sv-text-secondary); }
  .key[data-selected] { outline: 1px solid var(--sv-text-primary); outline-offset: 2px; }
  .head { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--sv-signal-error); pointer-events: none; }
  .head::before { content: ''; position: absolute; top: 0; left: -4px; width: 9px; height: 8px; background: var(--sv-signal-error); clip-path: polygon(0 0, 100% 0, 50% 100%); }
  .empty { margin: var(--sv-space-12) 0; color: var(--sv-text-muted); font-size: var(--sv-font-size-10); max-width: 520px; }
</style>
