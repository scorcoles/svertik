<script lang="ts">
  import PresetStrip from './PresetStrip.svelte';
  import { setFormulaWhere, t } from '@svertik/ui';
import { BLEND_MODES, EASES, mouseParams, apply, compositionParams, hasTextExpressions, isNumericExpression, placementOf, shapeRegistry, walkNodes, type Ease, type ParamSpec, type SceneNode } from '@svertik/engine';
  import FontField from './FontField.svelte';
  import VariableList from './VariableList.svelte';
  import InfoTip from './InfoTip.svelte';
  import ThisValues from './ThisValues.svelte';
  import NodeFormula from './NodeFormula.svelte';
  import { Button, Checkbox, ColorField, IconButton, NodeTargets, NumberField, ParamList, ParamRow, PointField, Section, Segmented, Select, Slider, groupOptions } from '@svertik/ui';
  import { layerOf } from './layer-of';
  import { PRESETS, locateNode, registry, type Editor } from './editor.svelte';

  interface Props {
    editor: Editor;
    node: SceneNode;
    onreplace: () => void;
  }
  let { editor, node, onreplace }: Props = $props();
  setFormulaWhere(() => [node.name]);
  const p = $derived(placementOf(node));
  // Placement values may hold formulas: those show as formulas, not as numbers.
  const raw = $derived({ x: node.transform?.x, y: node.transform?.y, scale: node.transform?.scale, rotation: node.transform?.rotation, opacity: node.opacity } as Record<string, unknown>);
  const formulaOf = (key: string) => (isNumericExpression(raw[key]) ? (raw[key] as { $expr: string; fallback: number }) : null);
  const setFormula = (key: 'x' | 'y' | 'scale' | 'rotation' | 'opacity') => (next: unknown) => editor.setNodeFormula(node.id, key, next);
  let positionSpace = $state<'local' | 'world'>('local');
  const parentInfo = $derived.by(() => {
    const parent = editor.scene ? locateNode(editor.scene.objects, node.id)?.parent : null;
    return parent ? editor.infos.get(parent.id) : undefined;
  });
  const receivedProps = $derived.by(() => {
    if (!editor.scene) return {};
    const path: SceneNode[] = [];
    const find = (items: SceneNode[], ancestors: SceneNode[]): boolean => {
      for (const item of items) {
        if (item.id === node.id) { path.push(...ancestors); return true; }
        if (item.children?.length && find(item.children, [...ancestors, item])) return true;
      }
      return false;
    };
    find(editor.scene.objects, []);
    const parent = path[path.length - 1];
    const inherited: Record<string, unknown> = {};
    for (const ancestor of path.slice(0, -1)) Object.assign(inherited, ancestor.props ?? {});
    if (!parent) return inherited;
    const native = parent.kind === 'shape' ? parent.params : {};
    return { ...native, ...(parent.transform ?? {}), ...(parent.opacity === undefined ? {} : { opacity: parent.opacity }), ...inherited, ...(parent.props ?? {}) };
  });
  function setCustomProp(name: string, value: unknown) { editor.setNodeProps(node.id, { ...(node.props ?? {}), [name]: value }); }
  function removeCustomProp(name: string) { const props = { ...(node.props ?? {}) }; delete props[name]; editor.setNodeProps(node.id, props); }
  function renameCustomProp(from: string, to: string) {
    editor.setNodeProps(node.id, Object.fromEntries(Object.entries(node.props ?? {}).map(([key, value]) => [key === from ? to : key, value])));
  }
  const reservedProps = $derived([
    ...Object.keys(receivedProps),
    ...(node.kind === 'shape' ? Object.keys(node.params) : []),
    ...Object.keys(node.transform ?? {}),
  ]);
  const nodeHelp = $derived(node.kind === 'group' && node.composition
    ? t('A nested scene with its own timeline. Open it to edit its objects; Release composition transfers its contents, animation and interactions here.')
    : node.kind === 'object' && node.packed
    ? t('Packed: the result is frozen and nothing inside is computed. Effects you add go on top. Unpack to restore the original with its effects and animation.')
    : node.kind === 'effector'
    ? t('Draws nothing. Its effects are appended to each target’s own stack and apply separately. Delay offsets their animation.')
    : node.kind === 'instance'
    ? t('A live copy of the original with its own position and effects. Changes to the original appear here too.')
    : node.kind === 'group'
    ? node.stack.some((m) => m.type === 'physics')
      ? t('Physics on this group simulates its children together. Add Rigid Body to set initial motion or make an immovable collider.')
      : t('Effects on a group apply to all its children together; Step treats each child as an element. Blend applies to each child.')
    : t('Effects below apply only to this object. Drag it on the canvas to move it.'));
  const shownPosition = $derived.by((): [number, number] => {
    const point = positionSpace === 'world' && parentInfo ? apply(parentInfo.matrix, [p.x, p.y]) : [p.x, p.y];
    return [point[0]!, point[1]!];
  });
  function setPosition(position: [number, number]) {
    editor.setNodePosition(node.id, position, positionSpace);
  }
  function setShapeParam(name: string, value: unknown) {
    if (node.kind === 'shape' && node.shape === 'rectangle' && name === 'linkCorners') {
      if (value) editor.setShapeParams(node.id, { radius: node.params.radiusTopLeft ?? node.params.radius ?? 0, linkCorners: true });
      else {
        // As stored (px or a percentage): copying keeps the unit.
        const radius = node.params.radius ?? 0;
        editor.setShapeParams(node.id, {
          radiusTopLeft: radius,
          radiusTopRight: radius,
          radiusBottomRight: radius,
          radiusBottomLeft: radius,
          linkCorners: false,
        });
      }
      return;
    }
    editor.setShapeParam(node.id, name, value);
  }
  // The slider widens by octaves so it stays useful at large scales.
  const scaleSliderMax = $derived(p.scale <= 16 ? 16 : 2 ** (Math.floor(Math.log2(p.scale)) + 1));
  const kindLabel = $derived(node.kind === 'group' ? node.composition ? 'composition' : `group · ${node.children.length}` : node.kind === 'shape' ? `${node.shape}` : node.kind === 'instance' ? node.mouse ? 'mouse instance' : 'instance' : node.kind === 'effector' ? `effector · ${node.targets.length}` : node.packed ? 'pack' : 'object');
  // Imported objects: how many shapes their SVG has (to expand it into one object per shape).
  const shapes = $derived(node.kind === 'object' && !node.packed ? editor.shapeCount(node.source) : 0);
  // Instance: of which object (any but itself).
  const others = $derived(editor.scene ? [...walkNodes(editor.scene.objects)].map((x) => x.node).filter((n) => n.id !== node.id && !(n.kind === 'group' && n.layer)) : []);
  // Object pickers group their choices under the layer of each object.
  const layers = $derived(editor.scene ? layerOf(editor.scene.objects) : new Map<string, string>());
  const sources = $derived(others.filter((n) => n.kind !== 'effector' && !(n.kind === 'instance' && n.mouse)).map((n) => ({ id: n.id, label: n.name, group: layers.get(n.id) })));
  const original = $derived(node.kind === 'instance' ? others.find((n) => n.id === node.of) : undefined);
  // Primitives: their parameters (shape ones at the top; style, in its section).
  const shapeDef = $derived(node.kind === 'shape' ? shapeRegistry.get(node.shape) : undefined);
  const shapeMain = $derived(Object.entries(shapeDef?.params ?? {}).filter(([n, s]) => !s.group && s.type !== 'path' && n !== 'text' && (n !== 'updateRate' || (node.kind === 'shape' && node.shape === 'text' && hasTextExpressions(node.params.text)))));
  const shapeGenerator = $derived([
    ...Object.entries(shapeDef?.params ?? {}).filter(([n]) => shapeDef?.timeDriven && (n === 'fill' || n === 'direction')),
    ...Object.entries(shapeDef?.params ?? {}).filter(([n, s]) => s.group === 'Generator' && n !== 'direction'),
  ]);
  const mouseFields = Object.entries(mouseParams).flatMap<[string, ParamSpec]>(([name, spec]) => name === 'offset'
    ? [['offsetX', { type: 'number', default: 0, step: 1, label: t('Offset X'), unit: 'px' }], ['offsetY', { type: 'number', default: 0, step: 1, label: t('Offset Y'), unit: 'px' }]]
    : [[name, spec]]);
  const mouseValues = $derived(node.kind === 'instance' && node.mouse ? {
    ...node.mouse, offsetX: (node.mouse.offset as unknown[] | undefined)?.[0] ?? 0, offsetY: (node.mouse.offset as unknown[] | undefined)?.[1] ?? 0,
  } : {});
  function setMouseField(name: string, value: unknown) {
    if (node.kind !== 'instance' || !node.mouse) return;
    if (name === 'offsetX' || name === 'offsetY') {
      const offset = Array.isArray(node.mouse.offset) ? [...node.mouse.offset] : [0, 0];
      offset[name === 'offsetX' ? 0 : 1] = value;
      editor.setMouseParam(node.id, 'offset', offset);
    } else editor.setMouseParam(node.id, name, value);
  }
  const ACTIONS = [
    { value: 'tween', label: t('Change a value') },
    { value: 'play', label: t('Play the timeline') },
    { value: 'seed', label: t('New seed') },
    { value: 'toggle', label: t('Toggle an effect') },
  ] as const;
  // Animation: diamonds for the primitive's parameters and the placement.
  function changeScale(value: number) {
    if (editor.selectedNodes.length > 1) editor.scaleSelection(Math.max(0.01, value) / (p.scale || 1));
    else editor.setNode(node.id, 'scale', value);
  }
  const shapeKey = (param: string) => (void editor.time, void editor.animation?.tracks.length, editor.keyState({ node: node.id, on: 'shape', param }));
  const nodeKey = (param: string) => (void editor.time, void editor.animation?.tracks.length, editor.keyState({ node: node.id, on: 'node', param }));
  const toggleNode = (...params: string[]) => {
    for (const param of params) editor.toggleKey({ node: node.id, on: 'node', param });
  };
  // Fill and stroke are edited on the rail (bottom left); the rest of the style here.
  const shapeStyle = $derived(Object.entries(shapeDef?.params ?? {}).filter(([n, s]) => s.group === 'Style' && n !== 'fillColor' && n !== 'strokeColor' && !(shapeDef?.timeDriven && n === 'fill')));
  // Typography first, followed by layout; text playback is the final advanced section.
  const isText = $derived(node.kind === 'shape' && node.shape === 'text');
  const beforeFont = $derived(isText ? [] : shapeMain);
  const afterFont = $derived(isText ? ['size'].flatMap(name => shapeMain.filter(([n]) => n === name)) : []);
  const textLayout = $derived(isText ? ['align', 'tracking', 'lineHeight', 'anchor'].flatMap(name => shapeMain.filter(([n]) => n === name)) : []);
  const textUpdate = $derived(isText ? shapeMain.filter(([n]) => n === 'updateRate') : []);

</script>

<header>
  <input
    class="name"
    value={node.name}
    aria-label={t('Name')}
    spellcheck="false"
    onchange={(e) => editor.setNode(node.id, 'name', e.currentTarget.value, true)}
    onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
  />
  <span class="meta">{kindLabel}</span>
  <InfoTip text={nodeHelp} visible={editor.showInfo} />
  {#if node.kind === 'shape' && shapeDef?.timeDriven}
    <IconButton icon="zero" label={t('Set generator values to zero')} onclick={() => editor.zeroShape(node.id)} />
    <IconButton icon="dice" label={t('Randomize generator values')} onclick={() => editor.randomizeShape(node.id)} />
  {/if}
</header>
<div class="params">
  {#if node.kind === 'shape' && shapeDef?.timeDriven && editor.showPresets}<PresetStrip {editor} shape />{/if}
  {#if editor.selectedNodes.length > 1}<InfoTip text={t('{count} selected. Scale applies to all around their shared center.', { count: editor.selectedNodes.length })} visible={editor.showInfo} />{/if}
  {#if node.kind === 'group' && node.composition}
    <Section title={t('Composition')}>
      <div class="actions"><Button label={t('Open composition')} onclick={() => editor.openComposition(node.id)} /></div>
      <div class="actions">
        <Button label={editor.keyState({ node: node.id, on: 'composition', param: 'time' }) === 'key' ? t('Remove time key') : editor.track({ node: node.id, on: 'composition', param: 'time' }) ? t('Add time key') : t('Animate time')} onclick={() => editor.toggleCompositionKey(node.id, 'time')} />
        <Button label={t('Follow scene time')} onclick={() => editor.setCompositionParam(node.id, 'time', { $expr: 'scene.time', fallback: 0 })} />
      </div>
      <ParamList params={Object.entries(compositionParams)} values={{ time: { $expr: 'scene.time', fallback: 0 }, ...node.composition.params }} keyOf={(param) => (void editor.time, void editor.animation?.tracks.length, editor.keyState({ node: node.id, on: 'composition', param }))} onkey={(param) => editor.toggleCompositionKey(node.id, param)} onchange={(name, value) => editor.setCompositionParam(node.id, name, value)} />
      <ParamRow label={t('Clock signal')}>
        <Select value={node.composition.modulation?.type ?? 'none'} options={['none', 'oscillate', 'wiggle', 'pulse', 'shake']} label={t('Clock signal')} onchange={(type) => editor.setClockModulator(node.id, type)} />
      </ParamRow>
      {#if node.composition.modulation}
        {@const signal = node.composition.modulation}
        <Section title={t('Clock signal · seconds')}>
          <ParamList params={Object.entries(registry.get(signal.type)!.params).filter(([name]) => !['perElement', 'elementPhase', 'elementDelay'].includes(name))} values={signal.params} onchange={(name, value) => editor.setClockSignalParam(node.id, name, value)} />
        </Section>
      {/if}
      {#if node.composition.scene.animation?.markers?.length}
        <ParamRow label={t('From marker')}>
          <Select value="—" options={['—', ...node.composition.scene.animation.markers.map((m, i) => `${i + 1}. ${m.name}`)]} label={t('Start from marker')} onchange={(name) => {
            const marker = node.kind === 'group' && node.composition?.scene.animation?.markers?.[parseInt(name, 10) - 1];
            if (marker) editor.setCompositionParam(node.id, 'offset', marker.t);
          }} />
        </ParamRow>
      {/if}
    </Section>
  {/if}
  {#if node.kind === 'instance'}
    <Section title={node.mouse ? "Mouse Instance" : "Instance"}>
      <ParamRow label={t('Of')} info={node.of && !original ? t('The original no longer exists. Pick another one.') : undefined} showInfo={editor.showInfo}>
        <Select
          value={original ? original.id : ''}
          options={[{ value: '', label: '—' }, ...groupOptions(sources)]}
          label={t('Of')}
          onchange={(id) => editor.setInstanceOf(node.id, id)}
        />
      </ParamRow>
      {#if node.mouse}
        <ParamList params={mouseFields} values={mouseValues} nodes={sources} onselectnode={(id) => (editor.selected = id)} onchange={setMouseField} />
        <p class="note mouse-help">{t('Generate copies on the canvas in Play. Target restricts input to its closed shape, even when hidden. Each copy starts its animation at zero. Life 0 keeps copies until the limit replaces the oldest.')}</p>
      {/if}
      {#if original}
        <div class="actions">
          <Button label={t('Select original')} onclick={() => (editor.selected = original.id)} />
          <Button label={original.visible === false ? t('Show original') : t('Hide original')} title={t('A hidden original still feeds its instances: use it as a master.')} onclick={() => editor.setNode(original.id, 'visible', original.visible === false, true)} />
        </div>
      {/if}
    </Section>
  {/if}
  {#if node.kind === 'effector'}
    <Section title={t('Targets')}>
      <NodeTargets value={node.targets} nodes={others.filter((n) => n.kind !== 'effector').map((n) => ({ id: n.id, label: n.name, group: layers.get(n.id) }))} onadd={(id) => editor.setEffectorTarget(node.id, id, true)} onremove={(id) => editor.setEffectorTarget(node.id, id, false)} onselect={(id) => (editor.selected = id)} />
      <ParamRow label={t('Delay')} for="eff-delay">
        <NumberField id="eff-delay" value={node.delay ?? 0} min={0} step={0.05} unit="s" onchange={(v) => editor.setEffectorDelay(node.id, v)} />
      </ParamRow>
    </Section>
  {/if}
  {#if node.kind === 'shape' && shapeDef}
    {#if shapeMain.length || isText}
      <Section title={shapeDef.section ?? shapeDef.label}>
        <ParamList swatches={editor.docColors} params={beforeFont} values={node.params} schema={Object.entries(shapeDef.params)} unitContext={{ document: editor.scene?.document ?? null }} keyOf={shapeKey} onkey={(n) => editor.toggleKey({ node: node.id, on: 'shape', param: n })} onchange={setShapeParam} />
        {#if isText}
          <FontField {editor} {node} />
          <ParamList swatches={editor.docColors} params={afterFont} values={node.params} schema={Object.entries(shapeDef.params)} unitContext={{ document: editor.scene?.document ?? null }} keyOf={shapeKey} onkey={(n) => editor.toggleKey({ node: node.id, on: 'shape', param: n })} onchange={setShapeParam} />
        {/if}
      </Section>
    {/if}
    {#if isText && node.kind === 'shape'}
      <Section title={t('Text layout')}><ParamList params={textLayout} values={node.params} keyOf={shapeKey} onkey={(n) => editor.toggleKey({ node: node.id, on: 'shape', param: n })} onchange={setShapeParam} /></Section>
      <Section title={t('Dynamic text')}><div class="actions"><Button label={t('Text ƒx')} onclick={() => editor.openTextFx(node.id)} /></div></Section>
    {/if}
    {#if shapeStyle.length}
      <Section title={t('Style')}>
        <ParamList swatches={editor.docColors} params={shapeStyle} values={node.params} keyOf={shapeKey} onkey={(n) => editor.toggleKey({ node: node.id, on: 'shape', param: n })} onchange={(n, v) => editor.setShapeParam(node.id, n, v)} />
      </Section>
    {/if}
    {#if shapeGenerator.length}
      <Section title={t('Generator')}>
        <ParamList swatches={editor.docColors} params={shapeGenerator} values={node.params} keyOf={shapeKey} onkey={(n) => editor.toggleKey({ node: node.id, on: 'shape', param: n })} onchange={(n, v) => editor.setShapeParam(node.id, n, v)} />
      </Section>
    {/if}
  {/if}
  {#if node.kind !== 'effector' && !(node.kind === 'instance' && node.mouse)}
  {#if !(node.kind === 'instance' && node.mouse)}
  <Section title={t('Transform')}>
    {#if parentInfo}
      <ParamRow label={t('Position space')}>
        <Segmented value={positionSpace} label={t('Position space')} options={[{ value: 'local', label: t('Local') }, { value: 'world', label: t('Canvas') }]} onchange={(value) => (positionSpace = value as 'local' | 'world')} />
      </ParamRow>
    {/if}
    <ParamRow label={t('Position')} for="node-x" keyState={nodeKey('x')} onkey={() => toggleNode('x', 'y')}>
      {#if formulaOf('x') || formulaOf('y')}
        <!-- One axis or both hold a formula: each shows its own (a plain one stays a number). -->
        <span class="axis">X</span>
        {#if formulaOf('x')}<NodeFormula label={`${t('Position')} X`} value={formulaOf('x')!} onchange={setFormula('x')} />{:else}<NumberField id="node-x" value={p.x} step={1} onchange={(v) => editor.setNode(node.id, 'x', v)} />{/if}
        <span class="axis">Y</span>
        {#if formulaOf('y')}<NodeFormula label={`${t('Position')} Y`} value={formulaOf('y')!} onchange={setFormula('y')} />{:else}<NumberField value={p.y} step={1} onchange={(v) => editor.setNode(node.id, 'y', v)} />{/if}
      {:else}
        <PointField id="node-x" label={t('Position')} step={1} value={shownPosition} onchange={setPosition} />
      {/if}
      <span class="mini">
        <IconButton icon="center" label={t('Center in document')} disabled={!editor.infos.has(node.id)} onclick={() => editor.centerNode(node.id)} />
      </span>
    </ParamRow>
    <ParamRow label={t('Scale')} for="node-scale" keyState={nodeKey('scale')} onkey={() => toggleNode('scale')} scrub={formulaOf('scale') ? undefined : { value: p.scale, step: 0.01, min: 0, onchange: changeScale }}>
      {#if formulaOf('scale')}<NodeFormula label={t('Scale')} value={formulaOf('scale')!} onchange={setFormula('scale')} />{:else}
      <NumberField id="node-scale" value={p.scale} step={0.01} min={0} onchange={changeScale} />
      <Slider value={p.scale} min={0} max={scaleSliderMax} step={0.01} curve="quadratic" label={t('Scale')} onchange={changeScale} />{/if}
    </ParamRow>
    <ParamRow label={t('Stretch')} for="node-stretch">
      <PointField id="node-stretch" label={t('Stretch')} step={0.01} value={p.stretch ?? [1, 1]} onchange={(v) => editor.setNode(node.id, 'stretch', v)} />
    </ParamRow>
    <ParamRow label={t('Rotation')} for="node-rot" keyState={nodeKey('rotation')} onkey={() => toggleNode('rotation')} scrub={formulaOf('rotation') ? undefined : { value: p.rotation, step: 1, onchange: (v) => editor.setNode(node.id, 'rotation', v) }}>
      {#if formulaOf('rotation')}<NodeFormula label={t('Rotation')} value={formulaOf('rotation')!} onchange={setFormula('rotation')} />{:else}
      <NumberField id="node-rot" value={p.rotation} step={1} unit="°" onchange={(v) => editor.setNode(node.id, 'rotation', v)} />{/if}
    </ParamRow>
    <ParamRow label={t('Pivot')} for="node-pivot">
      <PointField id="node-pivot" label={t('Pivot')} step={0.01} value={p.pivot ?? [0.5, 0.5]} onchange={(v) => editor.setPivot(node.id, v)} />
      <span class="mini">
        <IconButton
          icon="center"
          label={t('Center the pivot')}
          disabled={!p.pivot || (p.pivot[0] === 0.5 && p.pivot[1] === 0.5)}
          onclick={() => editor.setPivot(node.id, [0.5, 0.5], true)}
        />
      </span>
    </ParamRow>
    <ParamRow label={t('Flip')}>
      <IconButton icon="flip-h" label={t('Flip horizontally')} active={!!p.flipX} onclick={() => editor.setNode(node.id, 'flipX', !p.flipX, true)} />
      <IconButton icon="flip-v" label={t('Flip vertically')} active={!!p.flipY} onclick={() => editor.setNode(node.id, 'flipY', !p.flipY, true)} />
    </ParamRow>
  </Section>
  {/if}
  <Section title={t('Display')}>
    <ParamRow label={t('Opacity')} for="node-op" keyState={nodeKey('opacity')} onkey={() => toggleNode('opacity')}>
      {#if formulaOf('opacity')}<NodeFormula label={t('Opacity')} value={formulaOf('opacity')!} onchange={setFormula('opacity')} />{:else}
      <NumberField id="node-op" value={node.opacity ?? 1} step={0.01} min={0} max={1} onchange={(v) => editor.setNode(node.id, 'opacity', v)} />
      <Slider value={node.opacity ?? 1} min={0} max={1} step={0.01} label={t('Opacity')} onchange={(v) => editor.setNode(node.id, 'opacity', v)} />{/if}
    </ParamRow>
    <ParamRow label={t('Blend')} for="node-blend">
      <Select value={node.blend ?? 'normal'} options={BLEND_MODES} label={t('Blend mode')} onchange={(v) => editor.setNode(node.id, 'blend', v, true)} />
    </ParamRow>
    <ParamRow label={t('Visible')} for="node-vis">
      <Checkbox id="node-vis" checked={node.visible !== false} onchange={(v) => editor.setNode(node.id, 'visible', v, true)} />
    </ParamRow>
  </Section>
  <VariableList title={t('Props')} values={node.props ?? {}} namespace="props" prefix="prop" addLabel="Add custom prop" reserved={reservedProps} showInfo={editor.showInfo}
    info={t('Custom numeric values are forwarded to descendants. Map a parent value with an expression such as props.rotation; direct-parent native values do not pass through automatically.')}
    onchange={setCustomProp} onremove={removeCustomProp} onrename={renameCustomProp} />
  <Section title={t('Interactions')}>
    {#snippet action()}{#if editor.showInfo}<InfoTip text="Hover acts while the pointer is over the drawing. Click toggles. Enter triggers when the drawing scrolls into view. Pointer makes a value follow the mouse or finger in Play." />{/if}{/snippet}
    {#each (editor.scene?.interactions ?? []).filter((x) => x.node === node.id) as it (it.id)}
      {@const targets = editor.interactionTargets(node.id)}
      {@const current = targets.find((t) => t.target.on === it.target.on && t.target.param === it.target.param && (t.target.modifier ?? '') === (it.target.modifier ?? '')) ?? targets[2]}
      {@const effects = editor.interactionEffects(node.id)}
      {@const act = it.action ?? 'tween'}
      <div class="interaction">
        <ParamRow label={t('On')}>
          <Segmented value={it.trigger} label={t('Trigger')} options={[{ value: 'hover', label: 'hover' }, { value: 'click', label: 'click' }, { value: 'enter', label: 'enter' }, { value: 'pointer', label: 'pointer' }]} onchange={(v) => editor.setInteractionTrigger(it.id, v as 'hover' | 'click' | 'enter' | 'pointer')} />
        </ParamRow>
        {#if it.trigger === 'pointer'}
          {@const follows = editor.followTargets(node.id)}
          {@const ft = follows.find((t) => t.target.on === it.target.on && t.target.param === it.target.param && (t.target.modifier ?? '') === (it.target.modifier ?? '')) ?? follows[0]}
          <ParamRow label={t('Follow')}>
            <Select
              value={ft?.label ?? ''}
              options={follows.map((t) => t.label)}
              label={t('What follows the pointer')}
              width="172px"
              onchange={(v) => {
                const t = follows.find((x) => x.label === v);
                if (t) editor.setFollowTarget(it.id, t.target, t.kind);
              }}
            />
          <span class="mini">
            <IconButton icon="trash" label={t('Remove interaction')} onclick={() => editor.removeInteraction(it.id)} />
          </span>
          </ParamRow>
          <ParamRow label={t('Axis')}>
            <Segmented
              value={it.axis ?? (ft?.kind === 'point' ? 'both' : 'x')}
              label={t('Axis')}
              options={ft?.kind === 'point' ? [{ value: 'both', label: 'both' }, { value: 'x', label: 'x' }, { value: 'y', label: 'y' }] : [{ value: 'x', label: 'across' }, { value: 'y', label: 'down' }]}
              onchange={(v) => editor.updateInteraction(it.id, { axis: v as 'x' | 'y' | 'both' })}
            />
          </ParamRow>
          {#if ft && ft.kind !== 'point'}
            {@const r = it.range ?? [0, 1]}
            <ParamRow label={t('From')}>
              <NumberField value={r[0]} step={ft.kind === 'angle' ? 1 : 0.01} unit={ft.kind === 'angle' ? '°' : ''} onchange={(v) => editor.updateInteraction(it.id, { range: [v, r[1]] })} />
              <span class="dim">{t('to')}</span>
              <NumberField value={r[1]} step={ft.kind === 'angle' ? 1 : 0.01} unit={ft.kind === 'angle' ? '°' : ''} onchange={(v) => editor.updateInteraction(it.id, { range: [r[0], v] })} />
            </ParamRow>
          {/if}
          <ParamRow label={t('Lag')}>
            <NumberField value={it.duration} min={0} step={0.05} unit="s" onchange={(v) => editor.updateInteraction(it.id, { duration: Math.max(0, v) })} />
          </ParamRow>
          <ParamRow label={t('Stay')} for={`stay-${it.id}`}>
            <Checkbox id={`stay-${it.id}`} checked={!!it.stay} onchange={(v) => editor.updateInteraction(it.id, { stay: v })} />
          </ParamRow>
        {:else}
        <ParamRow label={t('Do')}>
          <Select
            value={ACTIONS.find((x) => x.value === act)!.label}
            options={ACTIONS.map((x) => x.label)}
            label={t('Action')}
            width="172px"
            onchange={(v) => editor.setInteractionAction(it.id, ACTIONS.find((x) => x.label === v)!.value)}
          />
        <span class="mini">
          <IconButton icon="trash" label={t('Remove interaction')} onclick={() => editor.removeInteraction(it.id)} />
        </span>
        </ParamRow>
        {#if act === 'tween'}
          <ParamRow label={t('Change')}>
            <Select
              value={current?.label ?? ''}
              options={targets.map((t) => t.label)}
              label={t('What changes')}
              width="172px"
              onchange={(v) => {
                const t = targets.find((x) => x.label === v);
                if (t) editor.updateInteraction(it.id, { target: t.target, to: t.kind === 'color' ? '#09fdd1' : t.target.param === 'scale' ? 1.2 : t.target.param === 'opacity' ? 0.5 : 0 });
              }}
            />
          </ParamRow>
          <ParamRow label={t('To')}>
            {#if current?.kind === 'color'}
              <ColorField value={String(it.to)} label={t('To')} onchange={(v) => editor.updateInteraction(it.id, { to: v })} />
            {:else}
              <NumberField value={Number(it.to) || 0} step={current?.kind === 'angle' ? 1 : 0.01} unit={current?.kind === 'angle' ? '°' : ''} onchange={(v) => editor.updateInteraction(it.id, { to: v })} />
            {/if}
          </ParamRow>
          <ParamRow label={t('Time')}>
            <NumberField value={it.duration} min={0.01} step={0.05} unit="s" onchange={(v) => editor.updateInteraction(it.id, { duration: v })} />
            <Select value={it.ease ?? 'ease-out'} options={EASES.filter((e) => e !== 'hold')} label={t('Ease')} width="104px" onchange={(v) => editor.updateInteraction(it.id, { ease: v as Ease })} />
          </ParamRow>
        {:else if act === 'play'}
          {@const seg = it.segment ?? [0, editor.animation?.duration ?? 3]}
          <ParamRow label={t('From')}>
            <NumberField value={seg[0]} min={0} step={0.05} unit="s" onchange={(v) => editor.updateInteraction(it.id, { segment: [v, seg[1]] })} />
            <span class="dim">{t('to')}</span>
            <NumberField value={seg[1]} min={0} step={0.05} unit="s" onchange={(v) => editor.updateInteraction(it.id, { segment: [seg[0], v] })} />
          </ParamRow>
        {:else}
          {@const list = act === 'seed' ? effects.filter((x) => x.hasSeed) : effects}
          <ParamRow label={t('Effect')}>
            <Select
              value={list.find((x) => x.id === it.target.modifier)?.label ?? '— none —'}
              options={['— none —', ...list.map((x) => x.label)]}
              label={t('Effect')}
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
      <Button label={t('+ Add interaction')} onclick={() => editor.addInteraction(node.id)} />
    </div>
  </Section>
  <Section title={t('Animate')}>
    {#snippet action()}{#if editor.showInfo}<InfoTip text="Letters, copies, tiles or pieces arrive one after another. Fall makes them leave. This adds a Stagger with two keyframes that you can edit." />{/if}{/snippet}
    <div class="presets">
      {#each PRESETS as name (name)}
        <Button label={name.charAt(0).toUpperCase() + name.slice(1)} onclick={() => editor.applyPreset(name)} />
      {/each}
    </div>
  </Section>
  {/if}
  {#if !(node.kind === 'instance' && node.mouse)}
  <div class="actions">
    {#if node.kind === 'effector'}
      <!-- An Effector is neither packed nor grouped: it draws nothing. -->
    {:else if node.kind === 'group' && node.composition}
      <Button label={t('Release composition')} title={t('Move contents into a regular group; bake its clock into the parent timeline and transfer interactions')} onclick={() => editor.releaseComposition(node.id)} />
    {:else if node.kind === 'object' && node.packed}
      <Button label={t('Unpack')} onclick={() => editor.unpack(node.id)} />
    {:else}
      {#if node.kind === 'object'}<Button label={t('Replace SVG…')} onclick={onreplace} />{/if}
      {#if node.kind === 'object' && !node.packed && shapes > 1}
        <Button
          label={`Expand (${shapes} shapes)`}
          title={t('One object per shape, in a group that keeps its place, its effects and its animation')}
          onclick={() => editor.expand(node.id)}
        />
      {/if}
      {#if node.kind === 'shape' && node.shape !== 'path'}<Button label={t('Convert to path')} title={t('Bake this primitive into SVG paths. Position and effects stay; shape parameters can no longer be edited.')} onclick={() => editor.outline(node.id)} />{/if}
      <Button label={t('Pack')} onclick={() => editor.pack(node.id)} />
    {/if}
    {#if node.kind === 'group' && !node.composition}
      <Button label={t('Ungroup')} onclick={() => editor.ungroup(node.id)} />
    {:else if node.kind !== 'effector' && node.kind !== 'group'}
      <Button label={t('Group')} onclick={() => editor.group(node.id)} />
    {/if}
    <Button label={t('Remove')} onclick={() => editor.remove(node.id)} />
  </div>
  {/if}
  {#if Object.keys(receivedProps).length}
    <Section title={t('Incoming props')}>
      {#snippet action()}{#if editor.showInfo}<InfoTip text="Read incoming values in formulas as props.name. Native values come only from the direct parent. Custom props can be mapped and passed down multiple levels." />{/if}{/snippet}
      <div class="props-list" aria-label={t('Incoming props')}>
        {#each Object.entries(receivedProps) as [name, value] (name)}
          <div class="prop-row"><code>props.{name}</code><span>{typeof value === 'number' ? value : (isNumericExpression(value) ? value.fallback : '—')}</span></div>
        {/each}
      </div>
    </Section>
  {/if}
  {#if node.kind !== 'group' || !node.layer}
    <div class="formula-values"><Section title={t('Values for formulas')} open={false}>
      {#snippet action()}{#if editor.showInfo}<InfoTip text={t('A formula of this object reads these as this.name, e.g. this.radius - 50. Click one to copy it.')} />{/if}{/snippet}
      <div class="this-list"><ThisValues
        schema={shapeDef?.params ?? {}}
        values={node.kind === 'shape' ? node.params : undefined}
        extra={[
          { name: 'x', label: 'X', value: node.transform?.x ?? 0 },
          { name: 'y', label: 'Y', value: node.transform?.y ?? 0 },
          { name: 'scale', label: t('Scale'), value: node.transform?.scale ?? 1 },
          { name: 'rotation', label: t('Rotation'), value: node.transform?.rotation ?? 0 },
          ...(node.opacity === undefined ? [] : [{ name: 'opacity', label: t('Opacity'), value: node.opacity }]),
        ]}
        oncopied={(message) => (editor.notice = message)} /></div>
    </Section></div>
  {/if}
  {#if isText && node.kind === 'shape' && textUpdate.length}
    <Section title={t('Text playback')}>
      <ParamList params={textUpdate} values={node.params} onchange={setShapeParam} />
    </Section>
  {/if}
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
  .name:focus { border-bottom-color: var(--sv-accent-text); }
  .meta { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .mini { display: flex; }
  .dim { color: var(--sv-text-muted); }
  .interaction { margin: 0 0 var(--sv-space-6); padding-bottom: var(--sv-space-4); border-bottom: var(--sv-border-1) solid var(--sv-rule-default); }
  .presets { display: flex; flex-wrap: wrap; gap: var(--sv-space-4); padding: var(--sv-space-4) var(--sv-space-8) 0 100px; }
  .mini :global(.sv-icon-button) { width: 18px; height: 18px; }
  .params { padding: var(--sv-space-6) 0; }
  /* Clear of the action buttons above it. */
  .axis { flex: none; color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .formula-values { margin-top: var(--sv-space-12); }
  .this-list { padding: 0 var(--sv-space-8) var(--sv-space-8); }
  .props-list { padding: 0 var(--sv-space-8) var(--sv-space-4) 100px; }
  .prop-row { display: flex; justify-content: space-between; gap: var(--sv-space-8); padding: 2px 0; color: var(--sv-text-secondary); font-size: var(--sv-font-size-10); }
  .prop-row code { color: var(--sv-accent-text); }
  .actions { display: flex; flex-wrap: wrap; gap: var(--sv-space-8); padding: var(--sv-space-8) var(--sv-space-8) 0 100px; }
</style>
