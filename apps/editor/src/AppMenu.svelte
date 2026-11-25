<script lang="ts">
  // The «svertik» menu: new, open, save, share, the demos and the language. Exporting lives only in the Export button.
  import { DropdownMenu } from 'bits-ui';
  import DemoItems from './DemoItems.svelte';
  import { Icon, t, type IconName } from '@svertik/ui';
  import { chooseLocale, locale, LOCALES } from './i18n';
  import type { Editor } from './editor.svelte';
  import type { DemoName } from './demo-catalog';

  interface Props {
    editor: Editor;
    onnew: () => void;
    onopen: () => void;
    onsave: () => void;
    onsaveas?: () => void;
    onshare: () => void;
    ontour: () => void;
    ondemo: (which: DemoName) => void;
  }
  let { editor, onnew, onopen, onsave, onsaveas, onshare, ontour, ondemo }: Props = $props();
  type Item = { label: string; icon: IconName; key?: string; run: () => void; needs?: boolean } | 'sep';
  const items: Item[] = $derived([
    { label: t('New scene'), icon: 'plus', run: onnew, needs: true },
    { label: t('Open project or import SVG…'), icon: 'import', key: '⌘O', run: onopen },
    { label: t('Save project'), icon: 'save', key: '⌘S', run: onsave, needs: true },
    ...(onsaveas ? [{ label: t('Save as…'), icon: 'save' as const, key: '⇧⌘S', run: onsaveas, needs: true }] : []),
    { label: t('Share link'), icon: 'share', run: onshare, needs: true },
    'sep',
    { label: t('Take the tour'), icon: 'marker', run: ontour },
    { label: t('Keyboard shortcuts'), icon: 'settings', key: '?', run: () => (editor.showShortcuts = true) },
  ]);
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger class="sv-app-trigger" aria-label={t('svertik menu')}>
    <span>svertik<span class="wordmark-suffix" aria-hidden="true">_</span></span><span class="caret" aria-hidden="true">▾</span>
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
          <span class="label">{t('Demos')}</span>
          <span class="key" aria-hidden="true">▸</span>
        </DropdownMenu.SubTrigger>
        <DropdownMenu.SubContent class="sv-menu sv-demos" side="right" align="start" sideOffset={4}>
          <DemoItems {ondemo} />
        </DropdownMenu.SubContent>
      </DropdownMenu.Sub>
      <!-- Each language by its own name, so anyone can find theirs. Choosing one reloads in it. -->
      <DropdownMenu.Sub>
        <DropdownMenu.SubTrigger class="sv-menu-item">
          <Icon name="text" />
          <span class="label">{t('Language')}</span>
          <span class="key">{LOCALES.find((l) => l.value === locale)?.label} ▸</span>
        </DropdownMenu.SubTrigger>
        <DropdownMenu.SubContent class="sv-menu" side="right" align="start" sideOffset={4}>
          {#each LOCALES as option (option.value)}
            <DropdownMenu.Item class="sv-menu-item" lang={option.value} onSelect={() => chooseLocale(option.value)}>
              <span class="label">{option.label}</span>
              {#if option.value === locale}<span class="key" aria-label={t('Current')}>✓</span>{/if}
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
  :global(.sv-app-trigger[data-state='open']) { background: var(--sv-accent-selection); color: var(--sv-accent-text); }
  :global([data-sv-theme='light'] .sv-app-trigger[data-state='open']) { color: #000; }
  :global([data-sv-theme='light'] .sv-app-trigger[data-state='open']) .wordmark-suffix { color: #000; }
  .wordmark-suffix { color: var(--sv-accent-text); }
  .caret { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); font-weight: normal; }
  .label { flex: 1; }
  .key { margin-left: var(--sv-space-16); color: var(--sv-text-secondary); font-size: var(--sv-font-size-10); }
  :global(.sv-app-trigger + * .sv-menu), :global(.sv-menu:has(.key)) { min-width: 300px; }
  :global(.sv-menu-sep) { height: 1px; margin: var(--sv-space-4) 0; background: var(--sv-rule-default); }
  :global(.sv-menu-item[data-disabled]) { opacity: 0.35; }
</style>
