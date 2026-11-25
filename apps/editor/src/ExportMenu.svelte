<script lang="ts">
  import { t } from '@svertik/ui';
  // The only place to export from (the svertik menu no longer repeats it). Each format says what it keeps.
  import { DropdownMenu } from 'bits-ui';
  import { Icon, type IconName } from '@svertik/ui';
  import type { Editor } from './editor.svelte';

  interface Props {
    editor: Editor;
    disabled: boolean;
    onexportsvg: () => void;
    onexportpng: () => void;
    onexportmp4: () => void;
    onexportanimsvg: () => void;
    onexportlottie: () => void;
    oncopyjson: () => void;
    onshare: () => void;
  }
  let { editor, disabled, onexportsvg, onexportpng, onexportmp4, onexportanimsvg, onexportlottie, oncopyjson, onshare }: Props = $props();
  const hidden = $derived(editor.layers.filter((l) => l.visible === false).map((l) => l.name));

  type Item = { label: string; icon: IconName; hint: string; run: () => void } | 'sep';
  const items: Item[] = $derived([
    { label: t('SVG'), icon: 'export', hint: t('Vector, the current frame'), run: onexportsvg },
    { label: t('PNG (2×)'), icon: 'image', hint: t('Pixels at twice the size, the current frame'), run: onexportpng },
    { label: t('MP4'), icon: 'play', hint: t('Video of one cycle, on the canvas colour'), run: onexportmp4 },
    { label: t('Animated SVG'), icon: 'wave', hint: t('One .svg that plays by itself, no JavaScript'), run: onexportanimsvg },
    { label: t('Lottie (.json)'), icon: 'timeline', hint: t('For Lottie players; lists what does not fit'), run: onexportlottie },
    'sep',
    { label: t('Share link'), icon: 'share', hint: t('A short link that opens the scene in the editor'), run: onshare },
    { label: t('Copy JSON'), icon: 'object', hint: t('The scene, to paste into code or a file'), run: oncopyjson },
  ]);
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger class="sv-export-trigger" {disabled} title={t('Export the document, or copy its JSON')}>
    {t('Export')} <span class="caret" aria-hidden="true">▾</span>
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content class="sv-menu sv-export-menu" align="end" sideOffset={6}>
      {#if hidden.length}
        <!-- Hidden layers stay in the project file but are left out of every export. -->
        <p class="layers-note">{hidden.length === 1 ? t('Layer “{name}” is hidden: it is left out of SVG, PNG, video and Lottie (the JSON keeps it).', { name: hidden[0]! }) : t('{count} hidden layers are left out of SVG, PNG, video and Lottie (the JSON keeps them).', { count: hidden.length })}</p>
      {/if}
      {#each items as it, i (i)}
        {#if it === 'sep'}
          <DropdownMenu.Separator class="sv-export-sep" />
        {:else}
          <DropdownMenu.Item class="sv-menu-item" onSelect={it.run}>
            <Icon name={it.icon} />
            <span class="label">{it.label}{#if editor.showInfo}<span class="hint">{it.hint}</span>{/if}</span>
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
  /* Disabled: a neutral outline, not a dimmed turquoise block (nothing to export yet). */
  :global(.sv-export-trigger:disabled) { color: var(--sv-text-muted); background: none; border-color: var(--sv-rule-strong); cursor: default; filter: none; }
  .caret { font-size: var(--sv-font-size-10); font-weight: normal; }
  .label { flex: 1; display: flex; flex-direction: column; }
  .layers-note { margin: 0; padding: var(--sv-space-6) var(--sv-space-8); color: var(--sv-text-secondary); font-size: var(--sv-font-size-10); border-bottom: var(--sv-border-1) solid var(--sv-rule-default); }
  :global(.sv-export-menu) { min-width: 280px; }
  :global(.sv-export-menu .sv-menu-item) { height: auto; min-height: 24px; padding-block: var(--sv-space-4); }
  .hint { color: var(--sv-text-secondary); font-size: var(--sv-font-size-10); }
  :global(.sv-export-sep) { height: 1px; margin: var(--sv-space-4) 0; background: var(--sv-rule-default); }
</style>
