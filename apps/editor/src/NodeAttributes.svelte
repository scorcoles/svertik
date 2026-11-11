<script lang="ts">
  import { BLEND_MODES, EASES, placementOf, shapeRegistry, walkNodes, type Ease, type SceneNode } from '@svertik/engine';
  import FontField from './FontField.svelte';
  import { Button, Checkbox, ColorField, IconButton, NumberField, ParamList, ParamRow, PointField, Section, Segmented, Select, Slider } from '@svertik/ui';
  import { PRESETS, type Editor } from './editor.svelte';

  interface Props {
    editor: Editor;
    node: SceneNode;
    onreplace: () => void;
  }
  let { editor, node, onreplace }: Props = $props();
  const p = $derived(placementOf(node));
  const kindLabel = $derived(node.kind === 'group' ? `group · ${node.children.length}` : node.kind === 'shape' ? `${node.shape}` : node.kind === 'instance' ? 'instance' : node.kind === 'effector' ? `effector · ${node.targets.length}` : node.packed ? 'pack' : 'object');
  // Objetos importados: cuántas formas trae su SVG (para poder expandirlo en un objeto por forma).
  const shapes = $derived(node.kind === 'object' && !node.packed ? editor.shapeCount(node.source) : 0);
  // Instancia: de qué objeto (cualquiera menos ella misma).
  const others = $derived(editor.scene ? [...walkNodes(editor.scene.objects)].map((x) => x.node).filter((n) => n.id !== node.id) : []);
  const original = $derived(node.kind === 'instance' ? others.find((n) => n.id === node.of) : undefined);
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
  // Texto: la fuente (familia, peso y cursiva) va en su propio bloque, después del texto.
  const FONT = new Set(['font', 'weight', 'italic']);
  const isText = $derived(node.kind === 'shape' && node.shape === 'text');
  const beforeFont = $derived(isText ? shapeMain.slice(0, shapeMain.findIndex(([n]) => n === 'font')) : shapeMain);
  const afterFont = $derived(isText ? shapeMain.slice(shapeMain.findIndex(([n]) => n === 'font')).filter(([n]) => !FONT.has(n)) : []);
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
  {#if node.kind === 'instance'}
    <Section title="Instance">
      <ParamRow label="Of">
        <Select
          value={original?.name ?? '—'}
          options={['—', ...others.map((n) => n.name)]}
          label="Of"
          onchange={(v) => editor.setInstanceOf(node.id, others.find((n) => n.name === v)?.id ?? '')}
        />
      </ParamRow>
      {#if node.of && !original}<p class="note">The original no longer exists: pick another one.</p>{/if}
      {#if original}
        <div class="actions">
          <Button label="Select original" onclick={() => (editor.selected = original.id)} />
          <Button label={original.visible === false ? 'Show original' : 'Hide original'} title="A hidden original still feeds its instances: use it as a master." onclick={() => editor.setNode(original.id, 'visible', original.visible === false, true)} />
        </div>
      {/if}
    </Section>
  {/if}
  {#if node.kind === 'effector'}
    {@const free = others.filter((n) => n.kind !== 'effector' && !node.targets.includes(n.id))}
    <Section title="Targets">
      {#each node.targets as id (id)}
        {@const t = others.find((n) => n.id === id)}
        <ParamRow label="">
          <button type="button" class="target" disabled={!t} onclick={() => t && (editor.selected = t.id)}>{t?.name ?? 'missing object'}</button>
          <span class="mini">
            <IconButton icon="trash" label="Remove target" onclick={() => editor.setEffectorTarget(node.id, id, false)} />
          </span>
        </ParamRow>
      {/each}
      <ParamRow label={node.targets.length ? '' : 'Add'}>
        <Select value="+ Add target" options={['+ Add target', ...free.map((n) => n.name)]} label="Add target" onchange={(v) => { const t = free.find((n) => n.name === v); if (t) editor.setEffectorTarget(node.id, t.id, true); }} />
      </ParamRow>
      <ParamRow label="Delay" for="eff-delay">
        <NumberField id="eff-delay" value={node.delay ?? 0} min={0} step={0.05} unit="s" onchange={(v) => editor.setEffectorDelay(node.id, v)} />
      </ParamRow>
      <ParamRow label="On" for="eff-on">
        <Checkbox id="eff-on" checked={node.visible !== false} onchange={(v) => editor.setNode(node.id, 'visible', v, true)} />
      </ParamRow>
    </Section>
  {/if}
  {#if node.kind === 'shape' && shapeDef}
    <Section title={shapeDef.label}>
      <ParamList swatches={editor.docColors} params={beforeFont} values={node.params} keyOf={shapeKey} onkey={(n) => editor.toggleKey({ node: node.id, on: 'shape', param: n })} onchange={(n, v) => editor.setShapeParam(node.id, n, v)} />
      {#if node.kind === 'shape' && isText}
        <FontField {editor} {node} />
        <ParamList swatches={editor.docColors} params={afterFont} values={node.params} keyOf={shapeKey} onkey={(n) => editor.toggleKey({ node: node.id, on: 'shape', param: n })} onchange={(n, v) => editor.setShapeParam(node.id, n, v)} />
      {/if}
    </Section>
    <Section title="Style">
      <ParamList swatches={editor.docColors} params={shapeStyle} values={node.params} keyOf={shapeKey} onkey={(n) => editor.toggleKey({ node: node.id, on: 'shape', param: n })} onchange={(n, v) => editor.setShapeParam(node.id, n, v)} />
    </Section>
  {/if}
  {#if node.kind !== 'effector'}
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
          <Segmented value={it.trigger} label="Trigger" options={[{ value: 'hover', label: 'hover' }, { value: 'click', label: 'click' }, { value: 'enter', label: 'enter' }, { value: 'pointer', label: 'pointer' }]} onchange={(v) => editor.setInteractionTrigger(it.id, v as 'hover' | 'click' | 'enter' | 'pointer')} />
        </ParamRow>
        {#if it.trigger === 'pointer'}
          {@const follows = editor.followTargets(node.id)}
          {@const ft = follows.find((t) => t.target.on === it.target.on && t.target.param === it.target.param && (t.target.modifier ?? '') === (it.target.modifier ?? '')) ?? follows[0]}
          <ParamRow label="Follow">
            <Select
              value={ft?.label ?? ''}
              options={follows.map((t) => t.label)}
              label="What follows the pointer"
              width="172px"
              onchange={(v) => {
                const t = follows.find((x) => x.label === v);
                if (t) editor.setFollowTarget(it.id, t.target, t.kind);
              }}
            />
          <span class="mini">
            <IconButton icon="trash" label="Remove interaction" onclick={() => editor.removeInteraction(it.id)} />
          </span>
          </ParamRow>
          <ParamRow label="Axis">
            <Segmented
              value={it.axis ?? (ft?.kind === 'point' ? 'both' : 'x')}
              label="Axis"
              options={ft?.kind === 'point' ? [{ value: 'both', label: 'both' }, { value: 'x', label: 'x' }, { value: 'y', label: 'y' }] : [{ value: 'x', label: 'across' }, { value: 'y', label: 'down' }]}
              onchange={(v) => editor.updateInteraction(it.id, { axis: v as 'x' | 'y' | 'both' })}
            />
          </ParamRow>
          {#if ft && ft.kind !== 'point'}
            {@const r = it.range ?? [0, 1]}
            <ParamRow label="From">
              <NumberField value={r[0]} step={ft.kind === 'angle' ? 1 : 0.01} unit={ft.kind === 'angle' ? '°' : ''} onchange={(v) => editor.updateInteraction(it.id, { range: [v, r[1]] })} />
              <span class="dim">to</span>
              <NumberField value={r[1]} step={ft.kind === 'angle' ? 1 : 0.01} unit={ft.kind === 'angle' ? '°' : ''} onchange={(v) => editor.updateInteraction(it.id, { range: [r[0], v] })} />
            </ParamRow>
          {/if}
          <ParamRow label="Lag">
            <NumberField value={it.duration} min={0} step={0.05} unit="s" onchange={(v) => editor.updateInteraction(it.id, { duration: Math.max(0, v) })} />
          </ParamRow>
          <ParamRow label="Stay" for={`stay-${it.id}`}>
            <Checkbox id={`stay-${it.id}`} checked={!!it.stay} onchange={(v) => editor.updateInteraction(it.id, { stay: v })} />
          </ParamRow>
        {:else}
        <ParamRow label="Do">
          <Select
            value={ACTIONS.find((x) => x.value === act)!.label}
            options={ACTIONS.map((x) => x.label)}
            label="Action"
            width="172px"
            onchange={(v) => editor.setInteractionAction(it.id, ACTIONS.find((x) => x.label === v)!.value)}
          />
        <span class="mini">
          <IconButton icon="trash" label="Remove interaction" onclick={() => editor.removeInteraction(it.id)} />
        </span>
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
        {/if}
      </div>
    {/each}
    <div class="presets">
      <Button label="+ Add interaction" onclick={() => editor.addInteraction(node.id)} />
    </div>
    <p class="note">Hover: does it while the pointer is over, undoes it when it leaves. Click: toggles (Play restarts, Seed rolls a new one). Enter: when the drawing scrolls into view. Pointer: a value follows the mouse (or the finger) over the drawing. Try it with ▶ Play (bottom bar).</p>
  </Section>
  <Section title="Animate">
    <div class="presets">
      {#each PRESETS as name (name)}
        <Button label={name.charAt(0).toUpperCase() + name.slice(1)} onclick={() => editor.applyPreset(name)} />
      {/each}
    </div>
    <p class="note">Letters, copies, tiles or pieces arrive one after another (Fall: they leave). Adds a Stagger with two keyframes; tweak it like anything else.</p>
  </Section>
  {/if}
  <div class="actions">
    {#if node.kind === 'effector'}
      <!-- Un Effector no se empaqueta ni se agrupa: no dibuja nada. -->
    {:else if node.kind === 'object' && node.packed}
      <Button label="Unpack" onclick={() => editor.unpack(node.id)} />
    {:else}
      {#if node.kind === 'object'}<Button label="Replace SVG…" onclick={onreplace} />{/if}
      {#if node.kind === 'object' && !node.packed && shapes > 1}
        <Button
          label={`Expand (${shapes} shapes)`}
          title="One object per shape, in a group that keeps its place, its effects and its animation"
          onclick={() => editor.expand(node.id)}
        />
      {/if}
      {#if node.kind === 'shape'}<Button label="Convert to outlines" title="Turn it into editable paths (each letter, a path). Its effects stay." onclick={() => editor.outline(node.id)} />{/if}
      <Button label="Pack" onclick={() => editor.pack(node.id)} />
    {/if}
    {#if node.kind === 'group'}
      <Button label="Ungroup" onclick={() => editor.ungroup(node.id)} />
    {:else if node.kind !== 'effector'}
      <Button label="Group" onclick={() => editor.group(node.id)} />
    {/if}
    <Button label="Remove" onclick={() => editor.remove(node.id)} />
  </div>
  <p class="note">
    {node.kind === 'object' && node.packed
      ? 'Packed: the result is frozen and nothing inside is computed. Effects you add go on top. Unpack to get the original back, with its effects and animation.'
      : node.kind === 'effector'
      ? 'Draws nothing. Its effects (add them from the menus above) go at the end of each target’s own stack, on each one separately. Delay: each target plays the effector’s animation that much later than the one before.'
      : node.kind === 'instance'
      ? 'A live copy of the original, with its effects: change the original and this changes too. It has its own position and its own effects on top.'
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
  .target {
    flex: 1;
    min-width: 0;
    padding: 0 var(--sv-space-4);
    font: inherit;
    text-align: left;
    color: var(--sv-text-primary);
    background: none;
    border: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }
  .target:hover { color: var(--sv-accent-fill); }
  .target:disabled { color: var(--sv-text-disabled); cursor: default; }
  .dim { color: var(--sv-text-muted); }
  .interaction { margin: 0 0 var(--sv-space-6); padding-bottom: var(--sv-space-4); border-bottom: var(--sv-border-1) solid var(--sv-rule-default); }
  .presets { display: flex; flex-wrap: wrap; gap: var(--sv-space-4); padding: var(--sv-space-4) var(--sv-space-8) 0 100px; }
  .mini :global(.sv-icon-button) { width: 18px; height: 18px; }
  .params { padding: var(--sv-space-6) 0; }
  .actions { display: flex; flex-wrap: wrap; gap: var(--sv-space-8); padding: var(--sv-space-8) var(--sv-space-8) 0 100px; }
  .note { margin: 0; padding: var(--sv-space-8) var(--sv-space-8) 0 100px; color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
</style>
