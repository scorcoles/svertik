<script lang="ts">
  // Un solo «Export»: los formatos y copiar el JSON dejan de ocupar la barra.
  import { DropdownMenu } from 'bits-ui';
  import { Icon, type IconName } from '@svertik/ui';

  interface Props {
    disabled: boolean;
    onexportsvg: () => void;
    onexportpng: () => void;
    onexportanimsvg: () => void;
    onexportlottie: () => void;
    oncopyjson: () => void;
  }
  let { disabled, onexportsvg, onexportpng, onexportanimsvg, onexportlottie, oncopyjson }: Props = $props();

  type Item = { label: string; icon: IconName; run: () => void } | 'sep';
  const items: Item[] = $derived([
    { label: 'Export SVG', icon: 'export', run: onexportsvg },
    { label: 'Export PNG (2×)', icon: 'export', run: onexportpng },
    { label: 'Export animated SVG', icon: 'export', run: onexportanimsvg },
    { label: 'Export Lottie (.json)', icon: 'export', run: onexportlottie },
    'sep',
    { label: 'Copy JSON', icon: 'object', run: oncopyjson },
  ]);
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger class="sv-export-trigger" {disabled} title="Export the document, or copy its JSON">
    Export <span class="caret" aria-hidden="true">▾</span>
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content class="sv-menu" align="end" sideOffset={6}>
      {#each items as it, i (i)}
        {#if it === 'sep'}
          <DropdownMenu.Separator class="sv-export-sep" />
        {:else}
          <DropdownMenu.Item class="sv-menu-item" onSelect={it.run}>
            <Icon name={it.icon} />
            <span class="label">{it.label}</span>
          </DropdownMenu.Item>
        {/if}
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  :global(.sv-export-trigger) {
    display: flex;
    align-items: center;
    gap: var(--sv-space-4);
    height: var(--sv-size-row);
    padding: 0 var(--sv-space-12);
    font: inherit;
    font-weight: var(--sv-font-weight-bold);
    color: var(--sv-accent-on);
    background: var(--sv-accent-fill);
    border: var(--sv-border-1) solid var(--sv-accent-fill);
    border-radius: var(--sv-radius-none);
    cursor: pointer;
  }
  :global(.sv-export-trigger:hover),
  :global(.sv-export-trigger[data-state='open']) { filter: brightness(1.1); }
  :global(.sv-export-trigger:disabled) { opacity: 0.4; cursor: default; filter: none; }
  .caret { font-size: var(--sv-font-size-10); font-weight: normal; }
  .label { flex: 1; }
  :global(.sv-export-sep) { height: 1px; margin: var(--sv-space-4) 0; background: var(--sv-rule-default); }
</style>
