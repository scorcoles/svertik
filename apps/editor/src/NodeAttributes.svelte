<script lang="ts">
  import { BLEND_MODES, EASES, hasFont, placementOf, shapeRegistry, type Ease, type SceneNode } from '@svertik/engine';
  import { canUseSystemFonts, listSystemFonts } from './fonts';
  import { Button, Checkbox, ColorField, IconButton, NumberField, ParamList, ParamRow, PointField, Section, Segmented, Select, Slider } from '@svertik/ui';
  import { PRESETS, type Editor } from './editor.svelte';

  interface Props {
    editor: Editor;
    node: SceneNode;
    onreplace: () => void;
  }
  let { editor, node, onreplace }: Props = $props();
  const p = $derived(placementOf(node));
  const kindLabel = $derived(node.kind === 'group' ? `group · ${node.children.length}` : node.kind === 'shape' ? `${node.shape}` : node.packed ? 'pack' : 'object');
  // Primitivas: sus parámetros (los de forma arriba; el estilo, en su sección).
  const shapeDef = $derived(node.kind === 'shape' ? shapeRegistry.get(node.shape) : undefined);
  const shapeMain = $derived(Object.entries(shapeDef?.params ?? {}).filter(([, s]) => !s.group));
  const ACTIONS = [
    { value: 'tween', label: 'Change a value' },
    { value: 'play', label: 'Play the timeline' },
    { value: 'seed', label: 'New seed' },
    { value: 'toggle', label: 'Toggle an effect' },
  ] as const;
  // Animación: rombos de los parámetros de la primitiva y de la colocación.
  const shapeKey = (param: string) => (void editor.time, void editor.animation?.tracks.length, editor.keyState({ node: node.id, on: 'shape', param }));
  const nodeKey = (param: string) => (void editor.time, void editor.animation?.tracks.length, editor.keyState({ node: node.id, on: 'node', param }));
  const toggleNode = (...params: string[]) => {
    for (const param of params) editor.toggleKey({ node: node.id, on: 'node', param });
  };
  const shapeStyle = $derived(Object.entries(shapeDef?.params ?? {}).filter(([, s]) => s.group === 'Style'));
  // Fuentes del sistema (Chrome/Edge): se piden una vez; se suman a la lista del campo Font.
  let systemListed = $state(false);
  async function addSystemFonts() {
    try {
      const names = await listSystemFonts();
      editor.fonts = [...new Set([...editor.fonts, ...names])];
      systemListed = true;
    } catch {
      editor.notice = 'The browser didn’t allow reading system fonts.';
    }
  }
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
      <ParamList swatches={editor.docColors} fonts={editor.fonts} params={shapeMain} values={node.params} keyOf={shapeKey} onkey={(n) => editor.toggleKey({ node: node.id, on: 'shape', param: n })} onchange={(n, v) => editor.setShapeParam(node.id, n, v)} />
      {#if node.kind === 'shape' && node.shape === 'text'}
        {@const font = String(node.params.font ?? 'JetBrains Mono')}
        {#if editor.fontsTick >= 0 && !hasFont(font)}
          <p class="warn">“{font}” isn’t available here: drawn with JetBrains Mono.</p>
        {/if}
        {#if canUseSystemFonts() && !systemListed}
          <div class="actions"><Button label="System fonts…" onclick={addSystemFonts} /></div>
        {/if}
      {/if}
    </Section>
    <Section title="Style">
      <ParamList swatches={editor.docColors} params={shapeStyle} values={node.params} keyOf={shapeKey} onkey={(n) => editor.toggleKey({ node: node.id, on: 'shape', param: n })} onchange={(n, v) => editor.setShapeParam(node.id, n, v)} />
    </Section>
  {/if}
  <Section title="Transform">
    <ParamRow label="Position" for="node-x" keyState={nodeKey('x')} onkey={() => toggleNode('x', 'y')}>
      <PointField id="node-x" label="Position" step={1} value={[p.x, p.y]} onchange={([x, y]) => { editor.setNode(node.id, 'x', x); editor.setNode(node.id, 'y', y); }} />
    </ParamRow>
    <ParamRow label="Scale" for="node-scale" keyState={nodeKey('scale')} onkey={() => toggleNode('scale')}>
      <NumberField id="node-scale" value={p.scale} step={0.01} min={0} onchange={(v) => editor.setNode(node.id, 'scale', v)} />
      <Slider value={p.scale} min={0} max={4} step={0.01} label="Scale" onchange={(v) => editor.setNode(node.id, 'scale', v)} />
    </ParamRow>
    <ParamRow label="Rotation" for="node-rot" keyState={nodeKey('rotation')} onkey={() => toggleNode('rotation')}>
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
    <ParamRow label="Opacity" for="node-op" keyState={nodeKey('opacity')} onkey={() => toggleNode('opacity')}>
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
  <Section title="Interactions">
    {#each (editor.scene?.interactions ?? []).filter((x) => x.node === node.id) as it (it.id)}
      {@const targets = editor.interactionTargets(node.id)}
      {@const current = targets.find((t) => t.target.on === it.target.on && t.target.param === it.target.param && (t.target.modifier ?? '') === (it.target.modifier ?? '')) ?? targets[2]}
      {@const effects = editor.interactionEffects(node.id)}
      {@const act = it.action ?? 'tween'}
      <div class="interaction">
        <ParamRow label="On">
          <Segmented value={it.trigger} label="Trigger" options={[{ value: 'hover', label: 'hover' }, { value: 'click', label: 'click' }, { value: 'enter', label: 'enter' }]} onchange={(v) => editor.updateInteraction(it.id, { trigger: v as 'hover' | 'click' | 'enter' })} />
          <span class="mini">
            <IconButton icon="trash" label="Remove interaction" onclick={() => editor.removeInteraction(it.id)} />
          </span>
        </ParamRow>
        <ParamRow label="Do">
          <Select
            value={ACTIONS.find((x) => x.value === act)!.label}
            options={ACTIONS.map((x) => x.label)}
            label="Action"
            width="172px"
            onchange={(v) => editor.setInteractionAction(it.id, ACTIONS.find((x) => x.label === v)!.value)}
          />
        </ParamRow>
        {#if act === 'tween'}
          <ParamRow label="Change">
            <Select
              value={current?.label ?? ''}
              options={targets.map((t) => t.label)}
              label="What changes"
              width="172px"
              onchange={(v) => {
                const t = targets.find((x) => x.label === v);
                if (t) editor.updateInteraction(it.id, { target: t.target, to: t.kind === 'color' ? '#09fdd1' : t.target.param === 'scale' ? 1.2 : t.target.param === 'opacity' ? 0.5 : 0 });
              }}
            />
          </ParamRow>
          <ParamRow label="To">
            {#if current?.kind === 'color'}
              <ColorField value={String(it.to)} label="To" onchange={(v) => editor.updateInteraction(it.id, { to: v })} />
            {:else}
              <NumberField value={Number(it.to) || 0} step={current?.kind === 'angle' ? 1 : 0.01} unit={current?.kind === 'angle' ? '°' : ''} onchange={(v) => editor.updateInteraction(it.id, { to: v })} />
            {/if}
          </ParamRow>
          <ParamRow label="Time">
            <NumberField value={it.duration} min={0.01} step={0.05} unit="s" onchange={(v) => editor.updateInteraction(it.id, { duration: v })} />
            <Select value={it.ease ?? 'ease-out'} options={EASES.filter((e) => e !== 'hold')} label="Ease" width="104px" onchange={(v) => editor.updateInteraction(it.id, { ease: v as Ease })} />
          </ParamRow>
        {:else if act === 'play'}
          {@const seg = it.segment ?? [0, editor.animation?.duration ?? 3]}
          <ParamRow label="From">
            <NumberField value={seg[0]} min={0} step={0.05} unit="s" onchange={(v) => editor.updateInteraction(it.id, { segment: [v, seg[1]] })} />
            <span class="dim">to</span>
            <NumberField value={seg[1]} min={0} step={0.05} unit="s" onchange={(v) => editor.updateInteraction(it.id, { segment: [seg[0], v] })} />
          </ParamRow>
        {:else}
          {@const list = act === 'seed' ? effects.filter((x) => x.hasSeed) : effects}
          <ParamRow label="Effect">
            <Select
              value={list.find((x) => x.id === it.target.modifier)?.label ?? '— none —'}
              options={['— none —', ...list.map((x) => x.label)]}
              label="Effect"
              width="172px"
              onchange={(v) => {
                const m = list.find((x) => x.label === v);
                editor.updateInteraction(it.id, { target: { node: node.id, on: 'modifier', modifier: m?.id, param: act === 'seed' ? 'seed' : '' } });
              }}
            />
          </ParamRow>
        {/if}
      </div>
    {/each}
    <div class="presets">
      <Button label="+ Add interaction" onclick={() => editor.addInteraction(node.id)} />
    </div>
    <p class="note">Hover: does it while the pointer is over, undoes it when it leaves. Click: toggles (Play restarts, Seed rolls a new one). Enter: when the drawing scrolls into view. Try it with ▶ Play (bottom bar).</p>
  </Section>
  <Section title="Animate">
    <div class="presets">
      {#each PRESETS as name (name)}
        <Button label={name.charAt(0).toUpperCase() + name.slice(1)} onclick={() => editor.applyPreset(name)} />
      {/each}
    </div>
    <p class="note">Letters, copies, tiles or pieces arrive one after another (Fall: they leave). Adds a Stagger with two keyframes; tweak it like anything else.</p>
  </Section>
  <div class="actions">
    {#if node.kind === 'object' && node.packed}
      <Button label="Unpack" onclick={() => editor.unpack(node.id)} />
    {:else}
      {#if node.kind === 'object'}<Button label="Replace SVG…" onclick={onreplace} />{/if}
      <Button label="Pack" onclick={() => editor.pack(node.id)} />
    {/if}
    {#if node.kind === 'group'}
      <Button label="Ungroup" onclick={() => editor.ungroup(node.id)} />
    {:else}
      <Button label="Group" onclick={() => editor.group(node.id)} />
    {/if}
    <Button label="Remove" onclick={() => editor.remove(node.id)} />
  </div>
  <p class="note">
    {node.kind === 'object' && node.packed
      ? 'Packed: the result is frozen and nothing inside is computed. Effects you add go on top. Unpack to get the original back, with its effects and animation.'
      : node.kind === 'group'
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
  .dim { color: var(--sv-text-muted); }
  .interaction { margin: 0 0 var(--sv-space-6); padding-bottom: var(--sv-space-4); border-bottom: var(--sv-border-1) solid var(--sv-rule-default); }
  .presets { display: flex; flex-wrap: wrap; gap: var(--sv-space-4); padding: var(--sv-space-4) var(--sv-space-8) 0 100px; }
  .mini :global(.sv-icon-button) { width: 18px; height: 18px; }
  .params { padding: var(--sv-space-6) 0; }
  .actions { display: flex; flex-wrap: wrap; gap: var(--sv-space-8); padding: var(--sv-space-8) var(--sv-space-8) 0 100px; }
  .warn { margin: 0; padding: 0 var(--sv-space-8) var(--sv-space-4) 100px; color: var(--sv-signal-error); font-size: var(--sv-font-size-10); }
  .note { margin: 0; padding: var(--sv-space-8) var(--sv-space-8) 0 100px; color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
</style>
