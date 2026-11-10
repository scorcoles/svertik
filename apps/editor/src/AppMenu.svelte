<script lang="ts">
  // El menú de «svertik»: abrir, guardar, exportar… y la demo.
  import { DropdownMenu } from 'bits-ui';
  import { Icon, type IconName } from '@svertik/ui';
  import type { Editor } from './editor.svelte';

  interface Props {
    editor: Editor;
    onnew: () => void;
    onopen: () => void;
    onsave: () => void;
    onexportsvg: () => void;
    onexportpng: () => void;
    onexportlottie: () => void;
    onexportanimsvg: () => void;
    oncopyjson: () => void;
    ondemo: (which: 'intro' | 'shatter' | 'reel') => void;
  }
  let { editor, onnew, onopen, onsave, onexportsvg, onexportpng, onexportlottie, onexportanimsvg, oncopyjson, ondemo }: Props = $props();
  type Item = { label: string; icon: IconName; key?: string; run: () => void; needs?: boolean } | 'sep';
  const items: Item[] = $derived([
    { label: 'New', icon: 'plus', run: onnew, needs: true },
    { label: 'Open project or import SVG…', icon: 'import', key: '⌘O', run: onopen },
    { label: 'Save project (.svrtk)', icon: 'save', key: '⌘S', run: onsave, needs: true },
    'sep',
    { label: 'Export SVG', icon: 'export', run: onexportsvg, needs: true },
    { label: 'Export PNG', icon: 'export', run: onexportpng, needs: true },
    { label: 'Export animated SVG', icon: 'export', run: onexportanimsvg, needs: true },
    { label: 'Export Lottie (.json)', icon: 'export', run: onexportlottie, needs: true },
    { label: 'Copy JSON', icon: 'object', run: oncopyjson, needs: true },
  ]);
  // Las demos, en su submenú.
  const demos: { label: string; which: 'intro' | 'shatter' | 'reel' }[] = [
    { label: 'Intro: the logo', which: 'intro' },
    { label: 'Shatter: a triangle that explodes', which: 'shatter' },
    { label: 'Reel: motion graphics in three acts', which: 'reel' },
  ];
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
          {#each demos as d (d.which)}
            <DropdownMenu.Item class="sv-menu-item" onSelect={() => ondemo(d.which)}>
              <Icon name="play" />
              <span class="label">{d.label}</span>
            </DropdownMenu.Item>
          {/each}
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
  /* Demos (aquí y en el lienzo vacío): nombres largos, con aire entre una y otra. */
  :global(.sv-menu.sv-demos) { width: 280px; }
  /* Si un nombre pasa a dos líneas, la fila crece y el icono se queda arriba, a la altura de la primera. */
  :global(.sv-demos .sv-menu-item) { height: auto; min-height: 28px; align-items: flex-start; padding-block: 6px; line-height: 16px; }
  :global(.sv-menu-sep) { height: 1px; margin: var(--sv-space-4) 0; background: var(--sv-rule-default); }
  :global(.sv-menu-item[data-disabled]) { opacity: 0.35; }
</style>
