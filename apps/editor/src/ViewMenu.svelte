<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import type { Editor } from './editor.svelte';

  // Canvas view options (never exported). They used to take a fixed block under the inspector; here, in the
  // status bar next to Notes, Code and Timeline, the right column is left to the stack and the attributes.
  let { editor }: { editor: Editor } = $props();
  let open = $state(false);

  type Key = 'showOriginal' | 'showWire' | 'showBounds' | 'showRulers' | 'showGuides' | 'smartGuides';
  const options: { key: Key; label: string; hint?: string }[] = [
    { key: 'showOriginal', label: 'Original', hint: 'The source drawing, before the stack' },
    { key: 'showWire', label: 'Wire', hint: 'Outlines only' },
    { key: 'showBounds', label: 'Bounds', hint: 'The edge of the document: what is exported and shown in Play' },
    { key: 'showRulers', label: 'Rulers' },
    { key: 'showGuides', label: 'Guides' },
    { key: 'smartGuides', label: 'Smart guides', hint: 'Snap to object edges, centers and document bounds' },
  ];
  const total = options.length + 1;
  const on = $derived(options.filter((o) => editor[o.key]).length + Number(editor.showEffectMenus));
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger class="sv-view-trigger" disabled={!editor.scene} title="Canvas view options (not exported)">
    View <span class="count">{on}/{total}</span> {open ? '▾' : '▴'}
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content class="sv-menu sv-view-menu" side="top" align="end" sideOffset={4}>
      <DropdownMenu.Group>
      <DropdownMenu.GroupHeading class="sv-menu-heading">View · not exported</DropdownMenu.GroupHeading>
      {#each options as o (o.key)}
        <DropdownMenu.CheckboxItem class="sv-menu-item" closeOnSelect={false} title={o.hint} checked={editor[o.key]} onCheckedChange={(v) => (editor[o.key] = v)}>
          {#snippet children({ checked })}
            <span class="box" data-checked={checked || undefined} aria-hidden="true">
              {#if checked}<svg viewBox="0 0 10 10"><path d="M2 5.2 4.2 7.4 8 2.8" /></svg>{/if}
            </span>
            {o.label}
          {/snippet}
        </DropdownMenu.CheckboxItem>
      {/each}
      </DropdownMenu.Group>
      <!-- Interface option is included in the total count above. -->
      <DropdownMenu.Separator class="sv-menu-rule" />
      <DropdownMenu.Group>
        <DropdownMenu.GroupHeading class="sv-menu-heading">Interface</DropdownMenu.GroupHeading>
        <DropdownMenu.CheckboxItem class="sv-menu-item" closeOnSelect={false} title="All effect menus in the top bar, including Utils. Hidden menus remain available in the command line (/)." checked={editor.showEffectMenus} onCheckedChange={(v) => (editor.showEffectMenus = v)}>
          {#snippet children({ checked })}
            <span class="box" data-checked={checked || undefined} aria-hidden="true">
              {#if checked}<svg viewBox="0 0 10 10"><path d="M2 5.2 4.2 7.4 8 2.8" /></svg>{/if}
            </span>
            Effect menus
          {/snippet}
        </DropdownMenu.CheckboxItem>
      </DropdownMenu.Group>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  :global(.sv-view-trigger) {
    height: 18px;
    padding: 0 var(--sv-space-6);
    font: inherit;
    color: var(--sv-text-secondary);
    background: none;
    border: 1px solid var(--sv-rule-strong);
    cursor: pointer;
  }
  :global(.sv-view-trigger:hover:not(:disabled)) { color: var(--sv-text-primary); border-color: var(--sv-text-muted); }
  :global(.sv-view-trigger[data-state='open']) { color: var(--sv-accent-fill); border-color: var(--sv-accent-fill); }
  :global(.sv-view-trigger:disabled) { opacity: 0.4; cursor: default; }
  .count { color: var(--sv-text-muted); font-variant-numeric: tabular-nums; }
  :global(.sv-view-menu) { width: 180px; }
  .box {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 12px;
    height: 12px;
    border: var(--sv-border-1) solid var(--sv-rule-strong);
  }
  .box[data-checked] { border-color: var(--sv-accent-fill); }
  .box svg { width: 10px; height: 10px; fill: none; stroke: var(--sv-accent-fill); stroke-width: 1.5; stroke-linecap: square; }
</style>
