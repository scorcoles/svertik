<script lang="ts">
  import { t } from '@svertik/ui';
  import { DropdownMenu } from 'bits-ui';
  import { Icon, type IconName } from '@svertik/ui';
  import type { Editor } from './editor.svelte';

  // Utilities that create objects working with others (instances…). Those that need a starting
  // object are disabled without a selection.
  let { editor, compact = false }: { editor: Editor; compact?: boolean } = $props();
  let compositionFile: HTMLInputElement;
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    class="sv-group-trigger{compact ? ' is-compact' : ''}"
    disabled={!editor.scene}
    title={compact ? 'Utils' : undefined}
    aria-label={compact ? 'Utils' : undefined}
  >
    <Icon name="instance" />
    {#if !compact}Utils <span class="caret" aria-hidden="true">▾</span>{/if}
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      class="sv-menu"
      align="start"
      side={compact ? 'right' : 'bottom'}
      sideOffset={compact ? 6 : 4}
    >
      <DropdownMenu.Item class="sv-menu-item" onSelect={() => editor.createComposition()}>
        <Icon name="composition" /> {t('Empty composition')}
      </DropdownMenu.Item>
      <DropdownMenu.Item class="sv-menu-item" disabled={!editor.selectedNodes.length} onSelect={() => editor.createComposition(true)}>
        <Icon name="composition" /> {t('Composition from selection')}
      </DropdownMenu.Item>
      <DropdownMenu.Item class="sv-menu-item" onSelect={() => compositionFile.click()}>
        <Icon name="import" /> {t('Import composition…')}
      </DropdownMenu.Item>
      <DropdownMenu.Separator class="sv-menu-rule" />
      <DropdownMenu.Item
        class="sv-menu-item"
        disabled={!editor.activeNode}
        title={t('A live copy of the selected object: change the original and the copy follows')}
        onSelect={() => editor.addInstance()}
      >
        <Icon name="instance" />
        {t('Instance')}
      </DropdownMenu.Item>
      <DropdownMenu.Item class="sv-menu-item" title={t('Generate copies at the cursor during Play')} onSelect={() => editor.addMouseInstance()}>
        <Icon name="mouse-instance" /> {t('Mouse Instance')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        class="sv-menu-item"
        title={t('Effects that apply to other objects (its targets), each on its own. Selected objects become its targets.')}
        onSelect={() => editor.addEffector()}
      >
        <Icon name="effector" />
        {t('Effector')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        class="sv-menu-item"
        title={t('A line that joins two objects and follows them. Select the two objects first.')}
        onSelect={() => editor.addConnector()}
      >
        <Icon name="connector" />
        {t('Connector')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        class="sv-menu-item"
        disabled={!editor.activeNode}
        title={t('A line that draws the path the selected object leaves behind while it moves (play the animation)')}
        onSelect={() => editor.addTracer()}
      >
        <Icon name="tracer" />
        {t('Tracer')}
      </DropdownMenu.Item>

    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<input bind:this={compositionFile} type="file" accept=".json,application/json,.svrtk" hidden onchange={async (e) => {
  const file = e.currentTarget.files?.[0];
  if (file) editor.importComposition(await file.text(), file.name);
  e.currentTarget.value = '';
}} />

<style>
  :global(.sv-group-trigger.is-compact) {
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
  }
  .caret { color: var(--sv-text-muted); font-size: var(--sv-font-size-10); }
</style>
