<script lang="ts">
  import { Button, IconButton, ParamControl, Section, Tabs } from '@svertik/ui';
  import { registry, type Editor } from './editor.svelte';
  import NodeAttributes from './NodeAttributes.svelte';

  let { editor, onreplace }: { editor: Editor; onreplace: () => void } = $props();
  let tab = $state('Params');
  const m = $derived(editor.current);
  const def = $derived(m ? registry.get(m.type) : undefined);
  // Sin grupo: arriba. Con grupo: secciones plegables, en el orden del esquema.
  const main = $derived(Object.entries(def?.params ?? {}).filter(([, s]) => !s.group).map(([n]) => n));
  const groups = $derived.by(() => {
    const out = new Map<string, string[]>();
    for (const [name, spec] of Object.entries(def?.params ?? {})) if (spec.group) out.set(spec.group, [...(out.get(spec.group) ?? []), name]);
    return [...out];
  });
</script>

<section class="attrs" aria-label="Attributes">
  {#if m && def}
    <header>
      <h2>{def.label}</h2>
      <span class="meta">{editor.currentParent ? `in ${registry.get(editor.currentParent.type)?.label}` : def.kind}</span>
      <IconButton icon="dice" label="Randomize (R)" onclick={() => editor.randomize()} />
    </header>
    {#if editor.currentParent}
      <p class="note">Per element: numbers grow ×1, ×2, ×3… Centers are each element's own.</p>
    {:else if m.children}
      <p class="note">Applies the modifiers nested under it to each element, stepping their numbers. Drop modifiers onto it, or select it and add.</p>
    {/if}
    <Tabs bind:value={tab} tabs={['Params', 'Info']}>
      {#snippet children(t)}
        {#if t === 'Params'}
          <div class="params">
            {#each main as name (name)}
              <ParamControl {name} spec={def.params[name]!} value={m.params?.[name]} onchange={(v) => editor.setParam(name, v)} />
            {/each}
            {#each groups as [group, names] (group)}
              <Section title={group}>
                {#each names as name (name)}
                  <ParamControl {name} spec={def.params[name]!} value={m.params?.[name]} onchange={(v) => editor.setParam(name, v)} />
                {/each}
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
    <p class="hint">Select an object or a modifier to edit it. Drop more SVGs to add objects.</p>
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
  .hint { margin: 0; padding: var(--sv-space-8); color: var(--sv-text-muted); }
  .note { margin: 0; padding: 0 var(--sv-space-8) var(--sv-space-8); color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
</style>
