<script lang="ts">
  // El menú de «svertik»: abrir, guardar, exportar… y la demo.
  import { DropdownMenu } from 'bits-ui';
  import DemoItems from './DemoItems.svelte';
  import { Icon, type IconName } from '@svertik/ui';
  import type { Editor } from './editor.svelte';
  import type { DemoName } from './demo-catalog';

  interface Props {
    editor: Editor;
    onnew: () => void;
    onopen: () => void;
    onsave: () => void;
    onexportsvg: () => void;
    onexportpng: () => void;
    onexportmp4: () => void;
    onexportlottie: () => void;
    onexportanimsvg: () => void;
    oncopyjson: () => void;
    ondemo: (which: DemoName) => void;
  }
  let { editor, onnew, onopen, onsave, onexportsvg, onexportpng, onexportmp4, onexportlottie, onexportanimsvg, oncopyjson, ondemo }: Props = $props();
  type Item = { label: string; icon: IconName; key?: string; run: () => void; needs?: boolean } | 'sep';
  const items: Item[] = $derived([
    { label: 'New scene', icon: 'plus', run: onnew, needs: true },
    { label: 'Open project or import SVG…', icon: 'import', key: '⌘O', run: onopen },
    { label: 'Save project (.svrtk)', icon: 'save', key: '⌘S', run: onsave, needs: true },
    'sep',
    { label: 'Export SVG', icon: 'export', run: onexportsvg, needs: true },
    { label: 'Export PNG', icon: 'image', run: onexportpng, needs: true },
    { label: 'Export MP4 (one cycle)', icon: 'play', run: onexportmp4, needs: true },
    { label: 'Export animated SVG', icon: 'wave', run: onexportanimsvg, needs: true },
    { label: 'Export Lottie (.json)', icon: 'timeline', run: onexportlottie, needs: true },
    { label: 'Copy JSON', icon: 'object', run: oncopyjson, needs: true },
  ]);
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger class="sv-app-trigger" aria-label="svertik menu">
    svertik <span class="caret" aria-hidden="true">▾</span>
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content class="sv-menu" align="start" sideOffset={6}>
      {#each items as it, i (i)}
        {#if it === 'sep'}
          <DropdownMenu.Separator class="sv-menu-sep" />
        {:else}
          <DropdownMenu.Item class="sv-menu-item" disabled={it.needs && !editor.scene} onSelect={it.run}>
            <Icon name={it.icon} />
            <span class="label">{it.label}</span>
            {#if it.key}<span class="key">{it.key}</span>{/if}
          </DropdownMenu.Item>
        {/if}
      {/each}
      <DropdownMenu.Separator class="sv-menu-sep" />
      <DropdownMenu.Sub>
        <DropdownMenu.SubTrigger class="sv-menu-item">
          <Icon name="play" />
          <span class="label">Demos</span>
          <span class="key" aria-hidden="true">▸</span>
        </DropdownMenu.SubTrigger>
        <DropdownMenu.SubContent class="sv-menu sv-demos" sideOffset={4}>
          <DemoItems {ondemo} />
        </DropdownMenu.SubContent>
      </DropdownMenu.Sub>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  :global(.sv-app-trigger) {
    display: flex;
    align-items: center;
    gap: var(--sv-space-4);
    height: 24px;
    padding: 0 var(--sv-space-4);
    font: inherit;
    font-size: var(--sv-font-size-12);
    font-weight: var(--sv-font-weight-bold);
    color: var(--sv-text-primary);
    background: none;
    border: 0;
    cursor: pointer;
  }
  :global(.sv-app-trigger:hover) { background: var(--sv-surface-hover); }
  :global(.sv-app-trigger[data-state='open']) { background: var(--sv-accent-selection); color: var(--sv-accent-fill); }
  .caret { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); font-weight: normal; }
  .label { flex: 1; }
  .key { margin-left: var(--sv-space-16); color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
  :global(.sv-app-trigger + * .sv-menu), :global(.sv-menu:has(.key)) { min-width: 300px; }
  :global(.sv-menu-sep) { height: 1px; margin: var(--sv-space-4) 0; background: var(--sv-rule-default); }
  :global(.sv-menu-item[data-disabled]) { opacity: 0.35; }
</style>
