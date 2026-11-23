<script lang="ts">
  import { IconButton, type IconName } from '@svertik/ui';
  import { onMount } from 'svelte';
  import { apply, invert, insertPathPoint, pathPointParam, isPathContours, manualPathParts, movePathHandle, pathPoint, setPathPointMode, type Mat, type NodeInfo, type PathContour, type PathPointMode, type ShapeNode, type Vec2 } from '@svertik/engine';
  import type { Editor } from './editor.svelte';
  let { editor, node, info, docToStage, clientToDoc, stageMatrix }: { editor: Editor; node: ShapeNode; info: NodeInfo; stageMatrix?: Mat; docToStage: (x: number, y: number) => [number, number] | null; clientToDoc: (x: number, y: number) => [number, number] | null } = $props();
  let selected = $state<{ contour: number; point: number } | null>(null);
  type PointRef = { contour: number; point: number };
  let selectedPoints = $state<PointRef[]>([]);
  let marquee = $state<{ x: number; y: number; width: number; height: number } | null>(null);
  const contains = (ci: number, pi: number) => selectedPoints.some(p => p.contour === ci && p.point === pi);
  function selectPoint(ci: number, pi: number) { if (!contains(ci, pi)) selectedPoints = [{ contour: ci, point: pi }]; selected = { contour: ci, point: pi }; }
  let adding = $state(false);
  const contours = $derived(isPathContours(node.params.contours) ? node.params.contours : []);
  const modes: { value: PathPointMode; icon: IconName; label: string; tip: string }[] = [
    { value: 'corner', icon: 'point-corner', label: 'Corner point', tip: 'Corner: remove both handles' },
    { value: 'free', icon: 'point-free', label: 'Free point', tip: 'Free: move handles independently' },
    { value: 'smooth', icon: 'point-smooth', label: 'Smooth point', tip: 'Smooth: link handle angles, keep separate lengths' },
    { value: 'symmetric', icon: 'point-symmetric', label: 'Symmetric point', tip: 'Symmetric: link handle angles and lengths' },
  ];
  function finish() { editor.editingPath = null; editor.tool = null; editor.flush(); }
  const closed = $derived(contours[selected?.contour ?? 0]?.closed ?? false);
  const active = $derived(selected ? contours[selected.contour]?.points[selected.point] : undefined);
  const screen = (p: Vec2): Vec2 => stageMatrix ? apply(stageMatrix, apply(info.matrix, p)) : docToStage(...apply(info.matrix, p)) ?? [0, 0];
  const absolute = (p: Vec2, h: Vec2): Vec2 => screen([p[0] + h[0], p[1] + h[1]]);
  function save(next: PathContour[], final = true) {
    editor.previewShapeParam(node.id, 'contours', next);
    if (final) { editor.setShapeParam(node.id, 'contours', next); editor.flush(); }
  }
  function mode(value: PathPointMode) {
    if (!selected || !active) return;
    const next = structuredClone($state.snapshot(contours));
    for (const ref of selectedPoints) if (next[ref.contour]?.points[ref.point]) next[ref.contour]!.points[ref.point] = setPathPointMode(next[ref.contour]!, ref.point, value);
    save(next);
  }
  function remove() {
    if (!selected || !active) return;
    const next = structuredClone($state.snapshot(contours));
    for (let ci = next.length - 1; ci >= 0; ci--) {
      next[ci]!.points = next[ci]!.points.filter((_, pi) => !contains(ci, pi));
      if (next[ci]!.points.length < 2) next.splice(ci, 1);
    }
    selected = null; selectedPoints = []; save(next);
  }

  function drag(e: PointerEvent, ci: number, pi: number, side?: 'in' | 'out') {
    if (e.button !== 0 || (e.currentTarget as Element).closest('.stage')?.hasAttribute('data-space')) return;
    e.preventDefault(); e.stopPropagation();
    if (e.altKey && !side) { selectPoint(ci, pi); editor.keyPathPoint(node.id, ci, pi); return; }
    if (e.shiftKey && !side) {
      if (contains(ci, pi)) { selectedPoints = selectedPoints.filter(p => p.contour !== ci || p.point !== pi); selected = selectedPoints.at(-1) ?? null; return; }
      selectedPoints = [...selectedPoints, { contour: ci, point: pi }]; selected = { contour: ci, point: pi };
    } else selectPoint(ci, pi);
    const el = e.currentTarget as SVGElement;
    el.focus({ preventScroll: true }); el.setPointerCapture(e.pointerId);
    const initial = structuredClone($state.snapshot(contours));
    const moving = [...selectedPoints];
    const inv = invert(info.matrix);
    const at = (ev: PointerEvent) => { const d = clientToDoc(ev.clientX, ev.clientY); return d ? apply(inv, d) : null; };
    const start = at(e); if (!start) return;
    const move = (ev: PointerEvent) => {
      const q = at(ev); if (!q) return;
      const next = structuredClone(initial), p = next[ci]!.points[pi]!;
      let delta: Vec2 = [q[0] - start[0], q[1] - start[1]];
      if (ev.shiftKey) { if (Math.abs(delta[0]) > Math.abs(delta[1])) delta = [delta[0], 0]; else delta = [0, delta[1]]; }
      if (!side) { for (const ref of moving) { const anchor = next[ref.contour]?.points[ref.point]; if (anchor) anchor.point = [anchor.point[0] + delta[0], anchor.point[1] + delta[1]]; } }
      else next[ci]!.points[pi] = movePathHandle(p, side, [p[side][0] + delta[0], p[side][1] + delta[1]], ev.altKey);
      save(next, false);
    };
    const up = (ev: PointerEvent) => {
      if (ev.type === 'pointercancel') save(initial, false);
      else save(structuredClone($state.snapshot(contours)));
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  function insert(e: MouseEvent, ci: number, segment: number) {
    e.preventDefault(); e.stopPropagation();
    const c = contours[ci]!, part = manualPathParts([c])[0]!, seg = part.segs[segment]!;
    const from = segment ? part.segs[segment - 1]!.p : part.start;
    // Find the closest position in screen space so zoom and non-uniform transforms are respected.
    const root = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
    let best = 0.5, distance = Infinity;
    for (let i = 1; i < 100; i++) {
      const t = i / 100, u = 1 - t;
      const q = screen([u*u*u*from[0] + 3*u*u*t*seg.c1[0] + 3*u*t*t*seg.c2[0] + t*t*t*seg.p[0], u*u*u*from[1] + 3*u*u*t*seg.c1[1] + 3*u*t*t*seg.c2[1] + t*t*t*seg.p[1]]);
      const d = Math.hypot(q[0] + root.left - e.clientX, q[1] + root.top - e.clientY);
      if (d < distance) { best = t; distance = d; }
    }
    const next = structuredClone($state.snapshot(contours)); next[ci] = insertPathPoint(next[ci]!, segment, best);
    selected = { contour: ci, point: segment + 1 }; selectedPoints = [selected]; save(next);
  }
  function add(e: PointerEvent) {
    if (e.button !== 0 || (e.currentTarget as Element).closest('.stage')?.hasAttribute('data-space')) return;
    e.preventDefault(); e.stopPropagation();
    if (!adding) {
      const target = e.currentTarget as SVGElement;
      const el = (target.ownerSVGElement ?? target) as SVGSVGElement, rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const initial = [...selectedPoints], extend = e.shiftKey;
      const move = (ev: PointerEvent) => {
        const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
        if (!marquee) {
          if (Math.hypot(px-x, py-y) < 3) return;
          el.setPointerCapture(e.pointerId);
        }
        marquee = { x: Math.min(x, px), y: Math.min(y, py), width: Math.abs(px-x), height: Math.abs(py-y) };
        const hit: PointRef[] = [];
        for (const [ci, c] of contours.entries()) for (const [pi, p] of c.points.entries()) {
          const q = screen(p.point);
          if (q[0] >= marquee.x && q[0] <= marquee.x + marquee.width && q[1] >= marquee.y && q[1] <= marquee.y + marquee.height) hit.push({ contour: ci, point: pi });
        }
        selectedPoints = extend ? [...initial, ...hit.filter(p => !initial.some(a => a.contour === p.contour && a.point === p.point))] : hit;
        selected = selectedPoints.at(-1) ?? null;
      };
      const up = (ev: PointerEvent) => {
        if (ev.type === 'pointercancel') selectedPoints = initial;
        else if (!marquee && !extend) selectedPoints = [];
        selected = selectedPoints.at(-1) ?? null; marquee = null;
        el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      return;
    }
    const d = clientToDoc(e.clientX, e.clientY); if (!d) return;
    const q = apply(invert(info.matrix), d), next = structuredClone($state.snapshot(contours));
    let ci = selected?.contour ?? next.length - 1;
    if (ci < 0 || next[ci]!.closed) { next.push({ closed: false, points: [] }); ci = next.length - 1; }
    next[ci]!.points.push(pathPoint(...q)); selected = { contour: ci, point: next[ci]!.points.length - 1 }; selectedPoints = [selected]; save(next);
  }
  function toggleClosed() {
    const ci = selected?.contour ?? 0, next = structuredClone($state.snapshot(contours));
    if (!next[ci] || next[ci]!.points.length < 2) return;
    next[ci]!.closed = !next[ci]!.closed; save(next);
  }
  onMount(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) return;
      const arrows: Record<string, Vec2> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); finish(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && !e.metaKey && !e.ctrlKey) { e.preventDefault(); e.stopImmediatePropagation(); remove(); }
      else if (arrows[e.key] && selected && !e.metaKey && !e.ctrlKey) {
        e.preventDefault(); e.stopImmediatePropagation();
        const next = structuredClone($state.snapshot(contours));
        const d = arrows[e.key]!, step = e.shiftKey ? 10 : 1;
        for (const ref of selectedPoints) { const p = next[ref.contour]?.points[ref.point]; if (p) p.point = [p.point[0] + d[0]*step, p.point[1] + d[1]*step]; }
        save(next);
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<svg class="path-editor" aria-label="Edit source path" onpointerdown={add} ondblclick={(e) => e.stopPropagation()}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <rect class="background" width="100%" height="100%" ondblclick={(e) => { e.preventDefault(); e.stopPropagation(); finish(); }} />
  {#each contours as contour, ci}
    {@const part = manualPathParts([contour])[0]}
    {#if part}
      {#each part.segs as seg, si}
        {@const from = screen(si ? part.segs[si - 1]!.p : part.start)}
        {@const c1 = screen(seg.c1)}{@const c2 = screen(seg.c2)}{@const end = screen(seg.p)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <path class="segment-hit" d={`M${from} C${c1} ${c2} ${end}`} onpointerdown={add} ondblclick={(e) => insert(e, ci, si)}><title>Double-click to insert a point</title></path>
        <path class="segment" d={`M${from} C${c1} ${c2} ${end}`} />
      {/each}
    {/if}
    {#each contour.points as point, pi}
      {@const p = screen(point.point)}
      {#if selected?.contour === ci && selected?.point === pi && point.mode !== 'corner'}
        {#each ['in', 'out'] as side}
          {@const key = side as 'in' | 'out'}{@const h = absolute(point.point, point[key])}
          <line class="handle-line" x1={p[0]} y1={p[1]} x2={h[0]} y2={h[1]} />
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <circle class="handle" cx={h[0]} cy={h[1]} r="5" tabindex="0" aria-label={`${side} handle`} onpointerdown={(e) => drag(e, ci, pi, key)}><title>Drag handle · Alt breaks linkage · Shift constrains axis</title></circle>
        {/each}
      {/if}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <rect class="point" data-selected={contains(ci, pi) || undefined} data-keyed={point.id && editor.keyState({ node: node.id, on: 'shape', param: pathPointParam(point.id) }) === 'key' || undefined} x={p[0]-5} y={p[1]-5} width="10" height="10" rx={point.mode === 'corner' || point.mode === 'free' ? 0 : 5} tabindex="0" aria-label={`Point ${pi+1}, ${point.mode}`} onfocus={() => selectPoint(ci, pi)} onpointerdown={(e) => drag(e, ci, pi)}><title>{point.mode} point · drag to move · Alt/Option-click to key position</title></rect>
    {/each}
  {/each}
  {#if marquee}<rect class="marquee" x={marquee.x} y={marquee.y} width={marquee.width} height={marquee.height} />{/if}
</svg>
<div class="path-toolbar" role="toolbar" tabindex="-1" aria-label="Path editing" onpointerdown={(e) => e.stopPropagation()}>
  <span>{selectedPoints.length ? `${selectedPoints.length} ${selectedPoints.length === 1 ? 'point' : 'points'}` : 'Path'}</span>
  <div class="controls" role="group" aria-label="Point type">
    {#each modes as item}
      <IconButton icon={item.icon} label={item.label} title={item.tip} active={selectedPoints.length > 0 && selectedPoints.every(ref => contours[ref.contour]?.points[ref.point]?.mode === item.value)} aria-pressed={selectedPoints.length > 0 && selectedPoints.every(ref => contours[ref.contour]?.points[ref.point]?.mode === item.value)} disabled={!active || editor.isLocked(node.id)} onclick={() => mode(item.value)} />
    {/each}
  </div>
  <div class="controls" role="group" aria-label="Path operations">
    <IconButton icon="point-add" label="Add points" title="Add points: click the canvas to extend the contour" active={adding} aria-pressed={adding} onclick={() => (adding = !adding)} />
    <IconButton icon="contour-add" label="New contour" onclick={() => { const next = structuredClone($state.snapshot(contours)); next.push({ closed: false, points: [] }); save(next); selected = { contour: next.length-1, point: -1 }; selectedPoints = []; adding = true; }} />
    <IconButton icon={closed ? 'path-open' : 'path-close'} label={closed ? 'Open contour' : 'Close contour'} disabled={(contours[selected?.contour ?? 0]?.points.length ?? 0) < 2} onclick={toggleClosed} />
    <IconButton icon="trash" label="Delete point" disabled={!active} onclick={remove} />
  </div>
  <IconButton icon="close" label="Finish editing path" title="Finish editing: Enter, Esc, another tool or double-click empty canvas" onclick={finish} />
</div>
<style>
  .path-editor { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 7; overflow: clip; cursor: var(--sv-point-cursor, crosshair); }
  .background { fill: transparent; }
  .segment { fill: none; stroke: var(--sv-canvas-accent); stroke-width: 1.5; pointer-events: none; }
  .segment-hit { fill: none; stroke: transparent; stroke-width: 12; cursor: copy; pointer-events: stroke; }
  .segment-hit:hover + .segment { stroke-width: 2.5; }
  .marquee { fill: color-mix(in srgb, var(--sv-canvas-accent) 12%, transparent); stroke: var(--sv-canvas-accent); stroke-width: 1; pointer-events: none; }
  .handle-line { stroke: var(--sv-canvas-accent); stroke-width: 1; pointer-events: none; }
  .point, .handle { fill: var(--sv-surface-panel); stroke: var(--sv-canvas-accent); stroke-width: 1.5; cursor: move; outline: none; }
  .point[data-keyed] { stroke: var(--sv-accent-fill); stroke-width: 3; }
  .point[data-selected], .point:focus, .handle:focus { fill: var(--sv-canvas-accent); stroke: var(--sv-text-primary); }
  .path-toolbar { position: absolute; z-index: 8; bottom: 12px; left: 50%; transform: translateX(-50%); width: max-content; max-width: calc(100% - 24px); display: flex; flex-wrap: wrap; gap: 4px; align-items: center; padding: 6px; background: var(--sv-surface-panel); border: 1px solid var(--sv-rule-strong); color: var(--sv-text-primary); font: 11px var(--sv-font-mono); }
  .path-toolbar span { padding: 0 6px; }
  .controls { display: flex; gap: 2px; align-items: center; }
  .controls + .controls { margin-left: 6px; }
  .path-toolbar :global(.sv-icon-button) { width: 28px; height: 28px; }
</style>
