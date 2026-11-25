<script lang="ts">
  import { t } from '@svertik/ui';
  // Editing a text on the canvas: a field on top, in place, with its font, size, colour, rotation and
  // alignment. Below, the result (with its effects) shows dimmed, instantly. Esc or click outside: done
  // (everything typed counts as a single undo step).
  import { onMount } from 'svelte';
  import { buildShape, fontFor, fontKey, type NodeInfo, type ShapeNode } from '@svertik/engine';
  import { previewFamily } from './fonts';
  import type { Editor } from './editor.svelte';

  interface Props {
    editor: Editor;
    node: ShapeNode;
    info: NodeInfo;
    /** Document → stage pixels. */
    docToStage: (x: number, y: number) => [number, number] | null;
    onclose: () => void;
  }
  let { editor, node, info, docToStage, onclose }: Props = $props();

  // svelte-ignore state_referenced_locally
  const before = String(node.params.text ?? '');
  // svelte-ignore state_referenced_locally
  let value = $state(before);
  let field = $state<HTMLTextAreaElement>();

  const p = $derived(node.params);
  // Use the engine's typographic anchor rather than centring the HTML line box on the ink.
  const place = $derived.by(() => {
    const size = Number(p.size ?? 72);
    const lineHeight = size * Number(p.lineHeight ?? 1.2);
    const params = { ...p, text: value, anchor: 'left' };
    const origin = buildShape('text', params).origin ?? [0, 0];
    const font = fontFor(fontKey(String(p.font ?? 'Commit Mono'), Number(p.weight ?? 400), !!p.italic), String(p.font ?? 'Commit Mono'))?.font;
    const lines = value.split('\n');
    const width = font ? Math.max(0, ...lines.map((line) => font.getAdvanceWidth(line, size, { kerning: true, tracking: Number(p.tracking ?? 0) }))) : size;
    const m = info.matrix;
    const point = (x: number, y: number) => docToStage(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
    const c = point(origin[0], origin[1] - lines.length * lineHeight / 2);
    const o = point(0, 0), u = point(1, 0), v = point(0, 1);
    if (!c || !o || !u || !v) return null;
    return { x: c[0], y: c[1], width: Math.max(1, width), height: lines.length * lineHeight,
      matrix: `${u[0] - o[0]}, ${u[1] - o[1]}, ${v[0] - o[0]}, ${v[1] - o[1]}, 0, 0` };
  });
  const family = $derived(previewFamily(String(p.font ?? 'Commit Mono'), Number(p.weight ?? 400), !!p.italic));

  onMount(() => {
    field?.focus({ preventScroll: true });
    field?.select();
  });
  function input() {
    editor.previewShapeParam(node.id, 'text', value);
  }
  function done() {
    // A single undo step: the history still has the previous text.
    if (value !== before) editor.setShapeParam(node.id, 'text', value);
    editor.flush();
    onclose();
  }
</script>

{#if place}
  <textarea
    bind:this={field}
    bind:value
    class="text-edit"
    aria-label={t('Edit text')}
    spellcheck="false"
    rows={Math.max(1, value.split('\n').length)}
    style:left="{place.x}px"
    style:top="{place.y}px"
    style:transform="matrix({place.matrix})"
    style:width="{place.width}px"
    style:height="{place.height}px"
    style:font-family="'{family}', 'Commit Mono', monospace"
    style:font-weight={Number(p.weight ?? 400)}
    style:font-style={p.italic ? 'italic' : 'normal'}
    style:font-size="{Number(p.size ?? 72)}px"
    style:line-height={Number(p.lineHeight ?? 1.2)}
    style:letter-spacing="{Number(p.tracking ?? 0) / 1000}em"
    style:text-align={String(p.align ?? 'center')}
    style:color={p.fill ? String(p.fillColor) : 'var(--sv-text-primary)'}
    oninput={input}
    onblur={done}
    onpointerdown={(e) => e.stopPropagation()}
    onkeydown={(e) => {
      e.stopPropagation();
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        field?.blur();
      }
    }}
  ></textarea>
{/if}

<style>
  .text-edit {
    position: absolute;
    z-index: 5;
    margin: 0;
    padding: 0;
    transform-origin: 0 0;
    background: transparent;
    border: 0;
    outline: 1px dashed var(--sv-accent-fill);
    outline-offset: 4px;
    caret-color: var(--sv-accent-fill);
    white-space: pre;
    overflow: hidden;
    resize: none;
    user-select: text;
  }
  .text-edit::selection { background: rgb(9 253 209 / 0.3); }
</style>
