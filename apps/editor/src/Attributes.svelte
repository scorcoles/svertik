<script lang="ts">
  import { Button, Checkbox, IconButton, ParamList, ParamRow, Section, Tabs } from '@svertik/ui';
  import { effectDescriptions, resolveParams, isNumericExpression, shapeRegistry, walkNodes, type ModifierInstance, type ParamSpec, type SceneNode } from '@svertik/engine';
  import { layerOf } from './layer-of';
  import { registry, type Editor } from './editor.svelte';
  import NodeAttributes from './NodeAttributes.svelte';
  import VariableList from './VariableList.svelte';
  import ShapeValues from './ShapeValues.svelte';
  import InfoTip from './InfoTip.svelte';
  import { PARTICLE_PRESETS } from './particle-presets';
  import { categoryOf } from './command';

  let { editor, onreplace }: { editor: Editor; onreplace: () => void } = $props();
  let tab = $state('Params');
  let aboutExpanded = $state(false);
  let panel = $state<HTMLElement>();
  // When the selection changes: back to the top and to Params (otherwise a short panel could end up
  // out of view because of the previous scroll, or open on the Info tab).
  let shown: string | null = null;
  $effect(() => {
    const id = editor.selected;
    if (id === shown) return;
    shown = id;
    tab = 'Params';
    aboutExpanded = false;
    if (panel) panel.scrollTop = 0;
  });
  const m = $derived(editor.current);
  function particlePreset(preset: (typeof PARTICLE_PRESETS)[number]) {
    if (!m || m.type !== 'particles') return;
    const params = { ...resolveParams(registry.get('particles')!.params), ...preset.params, time: m.params?.time ?? { $expr: 'scene.time', fallback: 0 }, seed: m.params?.seed ?? 1, center: m.params?.center ?? [.5,.5] };
    editor.flush();
    for (const [name, value] of Object.entries(params)) editor.setParam(name, value);
    editor.flush();
  }
  // Animation: the diamond of each effect parameter (a track on this effect of this object).
  const target = (param: string) => ({ node: editor.activeNode?.id ?? '', on: 'modifier' as const, modifier: m?.id, param });
  const keyOf = (param: string) => (void editor.time, void editor.animation?.tracks.length, editor.keyState(target(param)));
  const onkey = (param: string) => editor.toggleKey(target(param));
  function numericProps(values?: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(values ?? {}).flatMap(([key, value]) => {
      if (typeof value === 'number' && Number.isFinite(value)) return [[key, value]];
      if (isNumericExpression(value)) return [[key, value.fallback]];
      return [];
    }));
  }
  const incomingProps = $derived.by(() => {
    if (!m || !editor.scene || !editor.activeNode) return {};
    const owner = editor.activeNode;
    const nodePath: SceneNode[] = [];
    const findNode = (items: SceneNode[], ancestors: SceneNode[]): boolean => {
      for (const item of items) {
        if (item.id === owner.id) { nodePath.push(...ancestors, item); return true; }
        if (item.children?.length && findNode(item.children, [...ancestors, item])) return true;
      }
      return false;
    };
    findNode(editor.scene.objects, []);
    const values: Record<string, number> = {};
    for (const ancestor of nodePath.slice(0, -1)) Object.assign(values, numericProps(ancestor.props));
    if (owner.kind === 'shape') Object.assign(values, numericProps(owner.params));
    Object.assign(values, numericProps(owner.transform as Record<string, unknown>), numericProps(owner.opacity === undefined ? undefined : { opacity: owner.opacity }), numericProps(owner.props));

    const modifierPath: ModifierInstance[] = [];
    const findModifier = (items: ModifierInstance[], ancestors: ModifierInstance[]): boolean => {
      for (const item of items) {
        if (item.id === m.id) { modifierPath.push(...ancestors); return true; }
        if (item.children?.length && findModifier(item.children, [...ancestors, item])) return true;
      }
      return false;
    };
    findModifier(owner.stack, []);
    for (const parent of modifierPath) Object.assign(values, numericProps(parent.params), numericProps(parent.props));
    return values;
  });
  async function copyPropReference(name: string) {
    const reference = `props.${name}`;
    try {
      await navigator.clipboard.writeText(reference);
      editor.notice = `Copied ${reference}`;
    } catch {
      editor.notice = `Use ${reference} in a formula`;
    }
  }
  function setModifierProp(name: string, value: unknown) { if (m) editor.setModifierProps(m.id, { ...(m.props ?? {}), [name]: value }); }
  function removeModifierProp(name: string) { if (m) { const props = { ...(m.props ?? {}) }; delete props[name]; editor.setModifierProps(m.id, props); } }
  function renameModifierProp(from: string, to: string) {
    if (m) editor.setModifierProps(m.id, Object.fromEntries(Object.entries(m.props ?? {}).map(([key, value]) => [key === from ? to : key, value])));
  }
  // For effects that use another object: all but the effect's owner.
  // Grouped by layer in the picker; the layers themselves are its headings, not choices.
  const layers = $derived(editor.scene ? layerOf(editor.scene.objects) : new Map<string, string>());
  const others = $derived(
    editor.scene ? [...walkNodes(editor.scene.objects)].map((x) => x.node).filter((n) => n.id !== editor.activeNode?.id && !(n.kind === 'group' && n.layer) && (!['gravity', 'physics'].includes(m?.type ?? '') || (n.kind !== 'effector' && ![...walkNodes([n])].some(({ node }) => node.id === editor.activeNode?.id) && ![...walkNodes(editor.activeNode ? [editor.activeNode] : [])].some(({ node }) => node.id === n.id)))).map((n) => ({ id: n.id, label: n.name, group: layers.get(n.id) })) : [],
  );
  const def = $derived(m ? registry.get(m.type) : undefined);
  // No group: at the top. With groups: collapsible sections, in schema order.
  const main = $derived(
    Object.entries(def?.params ?? {}).filter(
      ([name, s]) => !s.group && !(m?.type === 'gradient' && name === 'transform'),
    ),
  );
  const groups = $derived.by(() => {
    const out = new Map<string, [string, ParamSpec][]>();
    const visible = (spec: ParamSpec) => !spec.showIf || Object.entries(spec.showIf).every(([param, allowed]) => {
      const value = m?.params?.[param] ?? def?.params[param]?.default;
      return allowed.includes(String(value));
    });
    for (const [name, spec] of Object.entries(def?.params ?? {})) if (spec.group && visible(spec)) out.set(spec.group, [...(out.get(spec.group) ?? []), [name, spec]]);
    // With a `mode`, groups named like another mode are hidden (Clone: Grid, Radial, Linear, Object).
    const mode = def?.params.mode ?? def?.params.kind;
    if (mode?.type === 'enum') {
      const current = String(m?.params?.mode ?? m?.params?.kind ?? mode.default);
      for (const g of [...out.keys()]) if (mode.options.includes(g.toLowerCase()) && g.toLowerCase() !== current) out.delete(g);
    }
    return [...out];
  });
  const schema = $derived(Object.entries(def?.params ?? {}) as [string, ParamSpec][]);
  const help = $derived.by(() => {
    if (!m || !def) return '';
    if (editor.currentParent?.type === 'wiggle' && m.type === 'transform') return 'Wiggle rotates and scales around this Transform pivot. Drag the Pivot handle to change its center of action.';
    if (editor.currentParent?.type === 'rgbsplit') return 'Applies only to the colored copies. Blur or Glow soften them; Step spreads them by element.';
    if (editor.currentParent?.type === 'step') return 'Per element: numbers grow ×1, ×2, ×3… Centers are each element’s own.';
    if (editor.currentParent?.type === 'stagger') return 'Per element: where it starts (In) or ends (Out). Centers are each element’s own.';
    if (editor.currentParent) return 'Per element: numbers go from their neutral value to this one, by how much the element is selected (0–1).';
    if (m.type === 'physics') return 'Simulates the children of this group as rigid bodies. Add Rigid Body to set initial velocity, spin, immovability or attraction. Add a hollow filled path as an immovable body to make an arena.';
    if (m.type === 'rigidbody') return 'Sets this child’s initial motion for a Physics group or Gravity. Immovable bodies stay fixed and can be used as colliders. In Physics, Attractor pulls other rigid bodies and receives their reaction unless Immovable is on. Absorption damps motion in its field so bodies can settle.';
    if (def.kind === 'filter') return 'Applies to the whole object, after its other effects, wherever it is in the stack. Drawn by the browser: a large or animated blur can be heavy on phones.';
    if (m.children) {
      if (m.type === 'rgbsplit') return 'Two colored copies, shifted. Modifiers nested under it apply only to the copies; Blur softens them and Step spreads them by element.';
      if (m.type === 'each') return 'Applies nested effects to each element separately (Clone copies, letters, tiles…). Their formulas can read element.distance, element.u, element.index… A Shape inside rebuilds each copy with other values for the shape\'s own parameters.';
      if (m.type === 'step') return 'Applies nested modifiers to each element, stepping their numbers. Drop modifiers here or select Step and add.';
      if (m.type === 'stagger') return 'Each element makes its own transition, a little after the previous one. Animate Progress from 0 to 1. In starts with the nested effects; Out ends with them.';
      if (m.type === 'range') return 'Selects elements by order. Nested modifiers act on selected letters, words, lines, copies, tiles or pieces. Animate Offset to sweep.';
      return 'Selects elements by where they are. Nested modifiers act more near the field; move or animate it to sweep.';
    }
    return '';
  });
</script>

<section class="attrs" aria-label="Attributes" bind:this={panel}>
  {#if m && def}
    <header>
      <h2>{m.name || def.label}</h2>
      <span class="meta">{editor.currentParent ? `in ${registry.get(editor.currentParent.type)?.label}` : categoryOf(def)}</span>
      {#if help && editor.showInfo}<InfoTip text={help} />{/if}
      <IconButton icon="zero" label="Set values to zero" onclick={() => editor.zero()} />
      <IconButton icon="dice" label="Randomize (R)" onclick={() => editor.randomize()} />
    </header>
    <Tabs bind:value={tab} tabs={['Params', 'Info']}>
      {#snippet children(t)}
        {#if t === 'Params'}
          <div class="params">
            {#if m.type === 'particles'}
              <div class="particle-presets" role="group" aria-label="Particle motion presets">
                {#each PARTICLE_PRESETS as preset}<Button label={preset.name} title={preset.tip} onclick={() => particlePreset(preset)} />{/each}
              </div>
            {/if}
            {#if m.type === 'shapevalues'}
              {@const owner = editor.activeNode}
              {@const shapeDef = owner?.kind === 'shape' ? shapeRegistry.get(owner.shape) : undefined}
              <ShapeValues each={m.params ?? {}} schema={shapeDef?.params ?? {}} values={owner?.kind === 'shape' ? owner.params : {}} showInfo={editor.showInfo}
                problem={editor.currentParent?.type !== 'each' ? 'Shape only works inside Each.' : !shapeDef || owner?.kind !== 'shape' || owner.shape === 'text' || owner.shape === 'path' ? 'Shape works on shape objects (not Text or Path).' : undefined}
                onchange={(values) => editor.setFreeParams(m.id, values)} />
            {/if}
            <ParamList swatches={editor.docColors} params={main} {schema} values={m.params} nodes={others} onselectnode={(id) => (editor.selected = id)} {keyOf} {onkey} onchange={(n, v) => editor.setParam(n, v)} />
            {#each groups as [group, entries] (group)}
              <Section title={group}>
                <ParamList swatches={editor.docColors} params={entries} {schema} values={m.params} nodes={others} onselectnode={(id) => (editor.selected = id)} {keyOf} {onkey} onchange={(n, v) => editor.setParam(n, v)} />
              </Section>
            {/each}
            {#if m.type !== 'shapevalues'}<VariableList title="Props" values={m.props ?? {}} namespace="props" prefix="prop" showInfo={editor.showInfo} reserved={Object.keys(m.params ?? {})}
              info="Custom numeric values are forwarded to nested modifiers. Formulas can map an incoming value with props.name; native modifier parameters do not pass through automatically."
              onchange={setModifierProp} onremove={removeModifierProp} onrename={renameModifierProp} />{/if}
            {#if m.type === 'boolean' && editor.activeNode?.kind === 'group'}
              <div class="actions boolean-path-actions">
                <Button label="To Path" title="Destructively bake the Boolean result at this frame. Its source objects, effects and animation will be removed; Undo restores them." onclick={() => editor.booleanToPath()} />
              </div>
            {/if}
          </div>
        {:else}
          {@const about = effectDescriptions[m.type]}
          <dl class="info">
            {#if about}
              <dt>About</dt><dd class="about" class:expanded={aboutExpanded}>{about}</dd>
              {#if about.length > 180}<dt></dt><dd class="about-actions"><button type="button" onclick={() => (aboutExpanded = !aboutExpanded)}>{aboutExpanded ? 'Show less' : 'View all'}</button></dd>{/if}
            {/if}
            <dt>Type</dt><dd>{m.type}</dd>
            <dt>Category</dt><dd>{categoryOf(def)}</dd>
            <dt>Id</dt><dd>{m.id}</dd>
          </dl>
          {#if Object.keys(incomingProps).length}
            <section class="incoming-info" aria-label="Incoming props">
              <h3>Incoming props</h3>
              {#each Object.entries(incomingProps) as [name, value] (name)}
                <div class="incoming-row"><button class="prop-reference" type="button" title={`Copy props.${name}`} onclick={() => void copyPropReference(name)}>props.{name}</button><span>{value}</span></div>
              {/each}
            </section>
          {/if}
          <div class="actions">
            <Button label="Reset" onclick={() => editor.reset()} />
            <Button label="Remove" onclick={() => editor.remove()} />
          </div>
        {/if}
      {/snippet}
    </Tabs>
  {:else if editor.currentNode}
    {#key editor.currentNode.id}<NodeAttributes {editor} node={editor.currentNode} {onreplace} />{/key}
  {:else if editor.scene}
    <p class="empty">Select an object or modifier to edit its parameters. Document settings are in the Document tab.</p>
  {/if}
</section>

<style>
  .particle-presets { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 8px 8px; }
  .attrs { flex: 1; min-height: 0; overflow-y: auto; }
  header { display: flex; align-items: center; justify-content: space-between; gap: var(--sv-space-8); height: 28px; padding: 0 var(--sv-space-4) 0 var(--sv-space-8); }
  .meta { margin-left: auto; }
  h2 { margin: 0; font-size: var(--sv-font-size-11); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .params { padding: var(--sv-space-6) 0; }
  .info { display: grid; grid-template-columns: 84px 1fr; gap: var(--sv-space-6) var(--sv-space-8); margin: 0; padding: var(--sv-space-12) var(--sv-space-8); }
  .info dt { color: var(--sv-text-secondary); text-align: right; }
  .info dd { margin: 0; color: var(--sv-text-primary); }
  .info .about { color: var(--sv-text-secondary); line-height: 1.5; }
  .info .about:not(.expanded) { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; line-clamp: 6; -webkit-line-clamp: 6; }
  .about-actions button { padding: 0; color: var(--sv-accent-fill); background: none; border: 0; font: inherit; cursor: pointer; }
  .incoming-info { margin: 0; padding: 0 var(--sv-space-8) var(--sv-space-12); }
  .incoming-info h3 { margin: var(--sv-space-4) 0 var(--sv-space-8); padding-top: var(--sv-space-8); color: var(--sv-text-secondary); border-top: var(--sv-border-1) solid var(--sv-rule-default); font: inherit; }
  .incoming-row { display: flex; justify-content: space-between; gap: var(--sv-space-8); min-height: 20px; align-items: center; }
  .incoming-row span { color: var(--sv-text-primary); text-align: right; }
  .prop-reference { padding: 0; color: var(--sv-accent-fill); background: transparent; border: 0; font: inherit; text-align: left; cursor: copy; }
  .prop-reference:hover { color: var(--sv-text-primary); text-decoration: underline; }
  .actions { display: flex; gap: var(--sv-space-8); padding: 0 var(--sv-space-8) var(--sv-space-12) 100px; }
  .boolean-path-actions { margin-top: var(--sv-space-12); }
  .empty { margin: 0; padding: var(--sv-space-12); color: var(--sv-text-muted); font-size: var(--sv-font-size-11); line-height: 1.5; }
</style>
