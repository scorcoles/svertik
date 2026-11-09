<script lang="ts">
  // Pila + atributos + lienzo con el motor de verdad: lo que será el editor v1, en pequeño.
  import { builtins, createEngine, resolveParams, type ModifierDef, type ModifierInstance, type Scene } from '@svertik/engine';
  import Button from '../lib/Button.svelte';
  import type { IconName } from '../lib/icons';
  import Panel from '../lib/Panel.svelte';
  import Section from '../lib/Section.svelte';
  import StackItem from '../lib/StackItem.svelte';
  import Tabs from '../lib/Tabs.svelte';
  import ParamControl from '../lib/ParamControl.svelte';

  const lines = [1, 2, 3, 4, 5]
    .map((i) => `<line x1="${20 + i * 26.66}" y1="40" x2="${20 + i * 26.66}" y2="160"/><line x1="20" y1="${40 + i * 20}" x2="180" y2="${40 + i * 20}"/>`)
    .join('');
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="20" y="40" width="160" height="120" fill="#09fdd1" stroke="#000" stroke-width="1.5"/><g stroke="#000" stroke-width="0.5" fill="none">${lines}</g></svg>`;

  const registry = new Map<string, ModifierDef>(builtins.map((m) => [m.type, m as ModifierDef]));
  const make = (type: string, i: number): ModifierInstance => ({
    id: `${type}-${i}`,
    type,
    enabled: true,
    params: { ...resolveParams(registry.get(type)!.params) },
  });

  let scene: Scene = $state({
    version: 1,
    source,
    stack: [make('transform', 0), make('spherize', 1), make('twist', 2), make('bend', 3), make('wave', 4)],
  });
  scene.stack[1]!.params!.strength = 0.6;
  scene.stack[2]!.params!.angle = 45;
  scene.stack[3]!.params!.angle = 20;

  let selected = $state('spherize-1');
  let tab = $state('Params');
  const current = $derived(scene.stack.find((m) => m.id === selected));
  const def = $derived(current ? registry.get(current.type) : undefined);
  let expanded = $state(true);
  // Sin grupo: arriba, sin cabecera. Con grupo: en secciones plegables, en el orden del esquema.
  const main = $derived(Object.entries(def?.params ?? {}).filter(([, s]) => !s.group).map(([n]) => n));
  const groups = $derived.by(() => {
    const out = new Map<string, string[]>();
    for (const [name, spec] of Object.entries(def?.params ?? {})) {
      if (spec.group) out.set(spec.group, [...(out.get(spec.group) ?? []), name]);
    }
    return [...out];
  });

  const engine = createEngine(builtins);
  let svg: SVGSVGElement;
  $effect(() => {
    const snapshot = $state.snapshot(scene) as Scene;
    engine.mount(svg, snapshot);
  });
</script>

<div class="editor">
  <Panel title="Stack">
    {#snippet actions()}<span class="muted">{scene.stack.length} modifiers</span>{/snippet}
    <div role="tree" aria-label="Modifier stack">
      <StackItem label="grid.svg" kind="object" {expanded} onexpand={(v) => (expanded = v)} />
      {#each expanded ? scene.stack : [] as m (m.id)}
        <StackItem
          label={registry.get(m.type)?.label ?? m.type}
          kind={registry.get(m.type)?.kind}
          icon={m.type as IconName}
          selected={m.id === selected}
          bind:enabled={m.enabled}
          onselect={() => (selected = m.id)}
        />
      {/each}
    </div>
  </Panel>

  <figure class="canvas"><svg bind:this={svg} aria-label="Result"></svg></figure>

  <Panel title={def?.label ?? '—'} meta={def?.kind} width="300px">
    <Tabs bind:value={tab} tabs={['Params', 'Info']}>
      {#snippet children(t)}
        <div class="params">
          {#if t === 'Params' && current && def}
            {#each main as name (name)}
              <ParamControl {name} spec={def.params[name]!} value={current.params?.[name]} onchange={(v) => (current.params![name] = v)} />
            {/each}
            {#each groups as [group, names] (group)}
              <Section title={group}>
                {#each names as name (name)}
                  <ParamControl {name} spec={def.params[name]!} value={current.params?.[name]} onchange={(v) => (current.params![name] = v)} />
                {/each}
              </Section>
            {/each}
          {:else if t === 'Info'}
            <p class="muted">Every control here is generated from the modifier's parameter schema in @svertik/engine.</p>
          {/if}
        </div>
      {/snippet}
    </Tabs>
    <div class="actions">
      <Button label="Export SVG" kind="primary" />
      <Button label="Copy JSON" />
    </div>
  </Panel>
</div>

<style>
  .editor { display: grid; grid-template-columns: 260px minmax(0, 1fr) 300px; gap: 16px; align-items: start; width: min(1100px, 100vw - 32px); }
  .canvas { margin: 0; display: grid; place-items: center; min-height: 400px; background: var(--sv-surface-field); border: 1px solid var(--sv-rule-default); }
  .canvas svg { width: 90%; overflow: visible; }
  .params { padding: 6px 0; }
  .actions { display: flex; gap: 8px; padding: 8px; border-top: 1px solid var(--sv-rule-default); }
  .muted { margin: 0; padding: 4px 8px; color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
</style>
