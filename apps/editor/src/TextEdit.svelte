<script lang="ts">
  // Editar un texto sobre el lienzo: un campo encima, en su sitio, con su fuente, tamaño, color, giro y
  // alineación. Debajo se ve el resultado (con sus efectos), atenuado, al momento. Esc o clic fuera: listo
  // (todo lo escrito cuenta como un solo paso de deshacer).
  import { onMount } from 'svelte';
  import type { NodeInfo, ShapeNode } from '@svertik/engine';
  import { previewFamily } from './fonts';
  import type { Editor } from './editor.svelte';

  interface Props {
    editor: Editor;
    node: ShapeNode;
    info: NodeInfo;
    /** Documento → píxeles del escenario. */
    docToStage: (x: number, y: number) => [number, number] | null;
    onclose: () => void;
  }
  let { editor, node, info, docToStage, onclose }: Props = $props();

  // svelte-ignore state_referenced_locally
  const before = String(node.params.text ?? '');
  // svelte-ignore state_referenced_locally
  let value = $state(before);
  let field = $state<HTMLTextAreaElement>();

  // Dónde y cómo: el centro del texto (su origen local), la escala y el giro de su matriz, con el zoom.
  const place = $derived.by(() => {
    const m = info.matrix;
    const c = docToStage(m[4], m[5]);
    const o = docToStage(0, 0), u = docToStage(1, 0);
    if (!c || !o || !u) return null;
    const zoom = Math.hypot(u[0] - o[0], u[1] - o[1]);
    const scale = Math.hypot(m[0], m[1]) * zoom;
    const angle = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
    return { x: c[0], y: c[1], scale, angle };
  });
  const p = $derived(node.params);
  const family = $derived(previewFamily(String(p.font ?? 'JetBrains Mono'), Number(p.weight ?? 400), !!p.italic));

  onMount(() => {
    field?.focus();
    field?.select();
  });
  function input() {
    editor.previewShapeParam(node.id, 'text', value);
  }
  function done() {
    // Un solo paso de deshacer: el historial aún tiene el texto de antes.
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
    aria-label="Edit text"
    spellcheck="false"
    rows={Math.max(1, value.split('\n').length)}
    style:left="{place.x}px"
    style:top="{place.y}px"
    style:transform="translate(-50%, -50%) rotate({place.angle}deg)"
    style:font-family="'{family}', 'JetBrains Mono', monospace"
    style:font-weight={Number(p.weight ?? 400)}
    style:font-style={p.italic ? 'italic' : 'normal'}
    style:font-size="{Number(p.size ?? 72) * place.scale}px"
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
    padding: 0 0.1em;
    field-sizing: content;
    min-width: 1ch;
    background: transparent;
    border: 0;
    outline: 1px dashed var(--sv-accent-fill);
    outline-offset: 4px;
    caret-color: var(--sv-accent-fill);
    white-space: pre;
    overflow: hidden;
    resize: none;
  }
  .text-edit::selection { background: rgb(9 253 209 / 0.3); }
</style>
