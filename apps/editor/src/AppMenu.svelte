<script lang="ts">
  // El menú de «svertik»: abrir, guardar, exportar… y la demo.
  import { DropdownMenu } from 'bits-ui';
  import { Icon, type IconName } from '@svertik/ui';
  import type { Editor } from './editor.svelte';

  interface Props {
    editor: Editor;
    onopen: () => void;
    onsave: () => void;
    onexportsvg: () => void;
    onexportpng: () => void;
    oncopyjson: () => void;
    ondemo: (which: 'intro' | 'shatter') => void;
  }
  let { editor, onopen, onsave, onexportsvg, onexportpng, oncopyjson, ondemo }: Props = $props();
  type Item = { label: string; icon: IconName; key?: string; run: () => void; needs?: boolean } | 'sep';
  const items: Item[] = $derived([
    { label: 'Open project or import SVG…', icon: 'import', key: '⌘O', run: onopen },
    { label: 'Save project (.svrtk)', icon: 'save', key: '⌘S', run: onsave, needs: true },
    'sep',
    { label: 'Export SVG', icon: 'export', run: onexportsvg, needs: true },
    { label: 'Export PNG', icon: 'export', run: onexportpng, needs: true },
    { label: 'Copy JSON', icon: 'object', run: oncopyjson, needs: true },
    'sep',
    { label: 'Demo: intro', icon: 'play', run: () => ondemo('intro') },
    { label: 'Demo: shatter', icon: 'play', run: () => ondemo('shatter') },
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
  :global(.sv-app-trigger + * .sv-menu), :global(.sv-menu:has(.key)) { min-width: 260px; }
  :global(.sv-menu-sep) { height: 1px; margin: var(--sv-space-4) 0; background: var(--sv-rule-default); }
  :global(.sv-menu-item[data-disabled]) { opacity: 0.35; }
</style>
