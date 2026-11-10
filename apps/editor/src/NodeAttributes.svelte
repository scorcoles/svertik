<script lang="ts">
  import { BLEND_MODES, placementOf, shapeRegistry, type SceneNode } from '@svertik/engine';
  import { Button, Checkbox, IconButton, NumberField, ParamList, ParamRow, PointField, Section, Select, Slider } from '@svertik/ui';
  import type { Editor } from './editor.svelte';

  interface Props {
    editor: Editor;
    node: SceneNode;
    onreplace: () => void;
  }
  let { editor, node, onreplace }: Props = $props();
  const p = $derived(placementOf(node));
  const kindLabel = $derived(node.kind === 'group' ? `group · ${node.children.length}` : node.kind === 'shape' ? `${node.shape}` : 'object');
  // Primitivas: sus parámetros (los de forma arriba; el estilo, en su sección).
  const shapeDef = $derived(node.kind === 'shape' ? shapeRegistry.get(node.shape) : undefined);
  const shapeMain = $derived(Object.entries(shapeDef?.params ?? {}).filter(([, s]) => !s.group));
  const shapeStyle = $derived(Object.entries(shapeDef?.params ?? {}).filter(([, s]) => s.group === 'Style'));
</script>

<header>
  <input
    class="name"
    value={node.name}
    aria-label="Name"
    spellcheck="false"
    onchange={(e) => editor.setNode(node.id, 'name', e.currentTarget.value, true)}
    onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
  />
  <span class="meta">{kindLabel}</span>
</header>
<div class="params">
  {#if node.kind === 'shape' && shapeDef}
    <Section title={shapeDef.label}>
      <ParamList swatches={editor.docColors} params={shapeMain} values={node.params} onchange={(n, v) => editor.setShapeParam(node.id, n, v)} />
    </Section>
    <Section title="Style">
      <ParamList swatches={editor.docColors} params={shapeStyle} values={node.params} onchange={(n, v) => editor.setShapeParam(node.id, n, v)} />
    </Section>
  {/if}
  <Section title="Transform">
    <ParamRow label="Position" for="node-x">
      <PointField id="node-x" label="Position" step={1} value={[p.x, p.y]} onchange={([x, y]) => { editor.setNode(node.id, 'x', x); editor.setNode(node.id, 'y', y); }} />
    </ParamRow>
    <ParamRow label="Scale" for="node-scale">
      <NumberField id="node-scale" value={p.scale} step={0.01} min={0} onchange={(v) => editor.setNode(node.id, 'scale', v)} />
      <Slider value={p.scale} min={0} max={4} step={0.01} label="Scale" onchange={(v) => editor.setNode(node.id, 'scale', v)} />
    </ParamRow>
    <ParamRow label="Rotation" for="node-rot">
      <NumberField id="node-rot" value={p.rotation} step={1} unit="°" onchange={(v) => editor.setNode(node.id, 'rotation', v)} />
    </ParamRow>
    <ParamRow label="Pivot" for="node-pivot">
      <PointField id="node-pivot" label="Pivot" step={0.01} value={p.pivot ?? [0.5, 0.5]} onchange={(v) => editor.setPivot(node.id, v)} />
      <span class="mini">
        <IconButton
          icon="center"
          label="Center the pivot"
          disabled={!p.pivot || (p.pivot[0] === 0.5 && p.pivot[1] === 0.5)}
          onclick={() => editor.setPivot(node.id, [0.5, 0.5], true)}
        />
      </span>
    </ParamRow>
    <ParamRow label="Flip">
      <IconButton icon="flip-h" label="Flip horizontally" active={!!p.flipX} onclick={() => editor.setNode(node.id, 'flipX', !p.flipX, true)} />
      <IconButton icon="flip-v" label="Flip vertically" active={!!p.flipY} onclick={() => editor.setNode(node.id, 'flipY', !p.flipY, true)} />
    </ParamRow>
  </Section>
  <Section title="Display">
    <ParamRow label="Opacity" for="node-op">
      <NumberField id="node-op" value={node.opacity ?? 1} step={0.01} min={0} max={1} onchange={(v) => editor.setNode(node.id, 'opacity', v)} />
      <Slider value={node.opacity ?? 1} min={0} max={1} step={0.01} label="Opacity" onchange={(v) => editor.setNode(node.id, 'opacity', v)} />
    </ParamRow>
    <ParamRow label="Blend" for="node-blend">
      <Select value={node.blend ?? 'normal'} options={BLEND_MODES} label="Blend mode" onchange={(v) => editor.setNode(node.id, 'blend', v, true)} />
    </ParamRow>
    <ParamRow label="Visible" for="node-vis">
      <Checkbox id="node-vis" checked={node.visible !== false} onchange={(v) => editor.setNode(node.id, 'visible', v, true)} />
    </ParamRow>
  </Section>
  <div class="actions">
    {#if node.kind === 'object'}<Button label="Replace SVG…" onclick={onreplace} />{/if}
    {#if node.kind === 'group'}
      <Button label="Ungroup" onclick={() => editor.ungroup(node.id)} />
    {:else}
      <Button label="Group" onclick={() => editor.group(node.id)} />
    {/if}
    <Button label="Remove" onclick={() => editor.remove(node.id)} />
  </div>
  <p class="note">
    {node.kind === 'group'
      ? 'Effects on a group apply to all its children together; Step treats each child as an element. Blend applies to each child.'
      : 'Effects below apply only to it. Drag it on the canvas to move it.'}
  </p>
</div>

<style>
  header { display: flex; align-items: center; gap: var(--sv-space-8); height: 28px; padding: 0 var(--sv-space-8); }
  .name {
    flex: 1;
    min-width: 0;
    padding: 0;
    font: inherit;
    font-weight: var(--sv-font-weight-bold);
    color: var(--sv-text-primary);
    background: none;
    border: 0;
    border-bottom: 1px solid transparent;
    outline: none;
  }
  .name:hover { border-bottom-color: var(--sv-rule-strong); }
  .name:focus { border-bottom-color: var(--sv-accent-fill); }
  .meta { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .mini { display: flex; }
  .mini :global(.sv-icon-button) { width: 18px; height: 18px; }
  .params { padding: var(--sv-space-6) 0; }
  .actions { display: flex; flex-wrap: wrap; gap: var(--sv-space-8); padding: var(--sv-space-8) var(--sv-space-8) 0 100px; }
  .note { margin: 0; padding: var(--sv-space-8) var(--sv-space-8) 0 100px; color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
</style>
