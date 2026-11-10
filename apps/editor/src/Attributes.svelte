<script lang="ts">
  import DocumentAttributes from './DocumentAttributes.svelte';
  import { Button, IconButton, ParamList, Section, Tabs } from '@svertik/ui';
  import { walkNodes, type ParamSpec } from '@svertik/engine';
  import { registry, type Editor } from './editor.svelte';
  import NodeAttributes from './NodeAttributes.svelte';

  let { editor, onreplace }: { editor: Editor; onreplace: () => void } = $props();
  let tab = $state('Params');
  let panel = $state<HTMLElement>();
  // Al cambiar de selección: arriba del todo y en Params (si no, un panel corto podía quedar
  // fuera de la vista por el scroll del anterior, o abrirse en la pestaña Info).
  let shown: string | null = null;
  $effect(() => {
    const id = editor.selected;
    if (id === shown) return;
    shown = id;
    tab = 'Params';
    if (panel) panel.scrollTop = 0;
  });
  const m = $derived(editor.current);
  // Animación: el rombo de cada parámetro del efecto (pista sobre este efecto de este objeto).
  const target = (param: string) => ({ node: editor.activeNode?.id ?? '', on: 'modifier' as const, modifier: m?.id, param });
  const keyOf = (param: string) => (void editor.time, void editor.animation?.tracks.length, editor.keyState(target(param)));
  const onkey = (param: string) => editor.toggleKey(target(param));
  // Para los efectos que usan otro objeto: todos menos el dueño del efecto.
  const others = $derived(
    editor.scene ? [...walkNodes(editor.scene.objects)].map((x) => x.node).filter((n) => n.id !== editor.activeNode?.id).map((n) => ({ id: n.id, label: n.name })) : [],
  );
  const def = $derived(m ? registry.get(m.type) : undefined);
  // Sin grupo: arriba. Con grupo: secciones plegables, en el orden del esquema.
  const main = $derived(Object.entries(def?.params ?? {}).filter(([, s]) => !s.group));
  const groups = $derived.by(() => {
    const out = new Map<string, [string, ParamSpec][]>();
    for (const [name, spec] of Object.entries(def?.params ?? {})) if (spec.group) out.set(spec.group, [...(out.get(spec.group) ?? []), [name, spec]]);
    // Con un `mode`, los grupos que se llaman como otro modo no se ven (Clone: Grid, Radial, Linear, Object).
    const mode = def?.params.mode ?? def?.params.kind;
    if (mode?.type === 'enum') {
      const current = String(m?.params?.mode ?? m?.params?.kind ?? mode.default);
      for (const g of [...out.keys()]) if (mode.options.includes(g.toLowerCase()) && g.toLowerCase() !== current) out.delete(g);
    }
    return [...out];
  });
</script>

<section class="attrs" aria-label="Attributes" bind:this={panel}>
  {#if m && def}
    <header>
      <h2>{def.label}</h2>
      <span class="meta">{editor.currentParent ? `in ${registry.get(editor.currentParent.type)?.label}` : def.kind}</span>
      <IconButton icon="zero" label="Set values to zero" onclick={() => editor.zero()} />
      <IconButton icon="dice" label="Randomize (R)" onclick={() => editor.randomize()} />
    </header>
    {#if editor.currentParent}
      <p class="note">
        {editor.currentParent.type === 'step'
          ? 'Per element: numbers grow ×1, ×2, ×3… Centers are each element’s own.'
          : editor.currentParent.type === 'stagger'
            ? 'Per element: where it starts (In) or ends (Out). Centers are each element’s own.'
          : 'Per element: numbers go from their neutral value to this one, by how much the element is selected (0–1).'}
      </p>
    {:else if m.children}
      <p class="note">
        {m.type === 'step'
          ? 'Applies the modifiers nested under it to each element, stepping their numbers. Drop modifiers onto it, or select it and add.'
          : m.type === 'stagger'
            ? 'Each element makes its own transition, a little after the previous one, with its ease. Animate Progress from 0 to 1. In: from the nested modifiers to rest; Out: the other way.'
            : m.type === 'range'
            ? 'Selects elements by order (letters, words, lines, copies, tiles, pieces): the nested modifiers act on them, more or less by the shape. Animate Offset to sweep.'
            : 'Selects elements by where they are: the nested modifiers act more near the field. Move or animate it to sweep.'}
      </p>
    {/if}
    <Tabs bind:value={tab} tabs={['Params', 'Info']}>
      {#snippet children(t)}
        {#if t === 'Params'}
          <div class="params">
            <ParamList swatches={editor.docColors} params={main} values={m.params} nodes={others} {keyOf} {onkey} onchange={(n, v) => editor.setParam(n, v)} />
            {#each groups as [group, entries] (group)}
              <Section title={group}>
                <ParamList swatches={editor.docColors} params={entries} values={m.params} nodes={others} {keyOf} {onkey} onchange={(n, v) => editor.setParam(n, v)} />
              </Section>
            {/each}
          </div>
        {:else}
          <dl class="info">
            <dt>Type</dt><dd>{m.type}</dd>
            <dt>Kind</dt><dd>{def.kind}</dd>
            <dt>Id</dt><dd>{m.id}</dd>
          </dl>
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
    <DocumentAttributes {editor} />
  {/if}
</section>

<style>
  .attrs { flex: 1; min-height: 0; overflow-y: auto; }
  header { display: flex; align-items: center; justify-content: space-between; gap: var(--sv-space-8); height: 28px; padding: 0 var(--sv-space-4) 0 var(--sv-space-8); }
  .meta { margin-left: auto; }
  h2 { margin: 0; font-size: var(--sv-font-size-11); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  .params { padding: var(--sv-space-6) 0; }
  .info { display: grid; grid-template-columns: 84px 1fr; gap: var(--sv-space-6) var(--sv-space-8); margin: 0; padding: var(--sv-space-12) var(--sv-space-8); }
  .info dt { color: var(--sv-text-secondary); text-align: right; }
  .info dd { margin: 0; color: var(--sv-text-primary); }
  .actions { display: flex; gap: var(--sv-space-8); padding: 0 var(--sv-space-8) var(--sv-space-12) 100px; }
  .note { margin: 0; padding: 0 var(--sv-space-8) var(--sv-space-8); color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
</style>
