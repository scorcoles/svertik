<script lang="ts">
  import { t } from '@svertik/ui';
  import { DropdownMenu } from 'bits-ui';
  import type { Editor } from './editor.svelte';

  // Canvas view options (never exported). They used to take a fixed block under the inspector; here, in the
  // status bar next to Notes, Code and Timeline, the right column is left to the stack and the attributes.
  let { editor }: { editor: Editor } = $props();
  let open = $state(false);

  type Key = 'lightTheme' | 'showOriginal' | 'showWire' | 'onionSkin' | 'showBounds' | 'hideOutside' | 'showGrid' | 'showRulers' | 'showGuides' | 'smartGuides' | 'animationDisabled' | 'showInfo' | 'showLayers';
  const groups: { heading: string; options: { key: Key; label: string; hint?: string }[] }[] = [
    { heading: t('Display'), options: [
      { key: 'showOriginal', label: t('Original'), hint: t('The drawing before the stack') },
      { key: 'showWire', label: t('Wire'), hint: t('Outlines only') },
    ] },
    { heading: t('Document'), options: [
      { key: 'showBounds', label: t('Bounds'), hint: t('Document edge: what exports and plays') },
      { key: 'hideOutside', label: t('Hide outside'), hint: t('Clip artwork to the document bounds') },
    ] },
    { heading: t('Animation'), options: [
      { key: 'onionSkin', label: t('Onion skin'), hint: t('Frames before (blue) and after (green)') },
      { key: 'animationDisabled', label: t('Disable animation'), hint: t('Freeze scene time and hide the timeline') },
    ] },
    { heading: t('Workspace'), options: [
      { key: 'lightTheme', label: t('Light theme'), hint: t('Use a light interface; remembered in this browser') },
      { key: 'showGrid', label: t('Grid'), hint: t('Square grid; its step follows the zoom') },
      { key: 'showRulers', label: t('Rulers'), hint: t('Drag out of them to add a guide') },
      { key: 'showGuides', label: t('Guides'), hint: t('Lines from the rulers, saved in the scene') },
      { key: 'smartGuides', label: t('Smart guides'), hint: t('Snap to edges, centers and the document') },
      { key: 'showInfo', label: t('Show info'), hint: t('Show help and descriptions in the panels') },
      { key: 'showLayers', label: t('Layers panel'), hint: t('Below the properties; its × closes it') },
    ] },
  ];
  const options = groups.flatMap((group) => group.options);
  const total = options.length + 1;
  const on = $derived(options.filter((o) => editor[o.key]).length + Number(editor.showEffectMenus && !editor.commandInEffectsSlot));
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger class="sv-view-trigger" title={t('Workspace and canvas view options (not exported)')}>
    {t('View')} <span class="count">{on}/{total}</span> {open ? '▾' : '▴'}
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content class="sv-menu sv-view-menu" style="--sv-menu-width: 280px" side="top" align="end" sideOffset={4}>
      {#each groups as group, i (group.heading)}
        {#if i > 0}<DropdownMenu.Separator class="sv-menu-rule" />{/if}
        <DropdownMenu.Group>
          <DropdownMenu.GroupHeading class="sv-menu-heading">{group.heading}</DropdownMenu.GroupHeading>
          {#each group.options as o (o.key)}
            <DropdownMenu.CheckboxItem class="sv-menu-item" closeOnSelect={false} checked={editor[o.key]} onCheckedChange={(v) => (editor[o.key] = v)}>
              {#snippet children({ checked })}
                <span class="box" data-checked={checked || undefined} aria-hidden="true">
                  {#if checked}<svg viewBox="0 0 10 10"><path d="M2 5.2 4.2 7.4 8 2.8" /></svg>{/if}
                </span>
                <span class="text">{o.label}{#if editor.showInfo && o.hint}<span class="hint">{o.hint}</span>{/if}</span>
              {/snippet}
            </DropdownMenu.CheckboxItem>
          {/each}
        </DropdownMenu.Group>
      {/each}
      <DropdownMenu.Separator class="sv-menu-rule" />
      <DropdownMenu.Group>
        <DropdownMenu.GroupHeading class="sv-menu-heading">{t('Top bar')}</DropdownMenu.GroupHeading>
        <DropdownMenu.CheckboxItem class="sv-menu-item" closeOnSelect={false} disabled={editor.commandInEffectsSlot} checked={editor.showEffectMenus && !editor.commandInEffectsSlot} onCheckedChange={(v) => (editor.showEffectMenus = v)}>
          {#snippet children({ checked })}
            <span class="box" data-checked={checked || undefined} aria-hidden="true">
              {#if checked}<svg viewBox="0 0 10 10"><path d="M2 5.2 4.2 7.4 8 2.8" /></svg>{/if}
            </span>
            <span class="text">{t('Effect menus')}{#if editor.showInfo}<span class="hint">{t('Top bar menus; all are also in /')}</span>{/if}</span>
          {/snippet}
        </DropdownMenu.CheckboxItem>
      </DropdownMenu.Group>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  :global(.sv-view-trigger) {
    height: 20px;
    padding: 0 var(--sv-space-6);
    font: inherit;
    color: var(--sv-text-secondary);
    background: none;
    border: var(--sv-border-1) solid var(--sv-rule-default);
    cursor: pointer;
  }
  :global(.sv-view-trigger:hover:not(:disabled)) { color: var(--sv-text-primary); border-color: var(--sv-text-muted); }
  :global(.sv-view-trigger[data-state='open']) { color: var(--sv-accent-text); border-color: var(--sv-accent-fill); }
  :global(.sv-view-trigger:disabled) { opacity: 0.4; cursor: default; }
  .count { color: var(--sv-text-muted); font-variant-numeric: tabular-nums; }
  /* Each option says what it does in a second line (tooltips were not enough). */
  :global(.sv-view-menu .sv-menu-item) { height: auto; min-height: 24px; padding-block: var(--sv-space-4); }
  .text { display: flex; flex-direction: column; }
  .hint { color: var(--sv-text-secondary); font-size: var(--sv-font-size-10); }
  .box {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 12px;
    height: 12px;
    border: var(--sv-border-1) solid var(--sv-rule-strong);
  }
  .box[data-checked] { border-color: var(--sv-accent-fill); }
  :global([data-sv-theme='light']) .box[data-checked] { background: var(--sv-accent-fill); border-color: #256f60; }
  :global([data-sv-theme='light']) .box[data-checked] svg { stroke: #000; }
  :global([data-sv-theme='light'] .sv-view-trigger[data-state='open']) { color: #000; background: var(--sv-accent-fill); border-color: #256f60; }
  .box svg { width: 10px; height: 10px; fill: none; stroke: var(--sv-accent-text); stroke-width: 1.5; stroke-linecap: square; }
</style>
