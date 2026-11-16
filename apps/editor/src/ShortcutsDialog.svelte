<script lang="ts">
  // Keyboard shortcut sheet: opened with "?" or from the svertik menu. Lists only shortcuts the editor
  // actually handles (App, Canvas, the stack tree and the timeline).
  import { Dialog } from 'bits-ui';
  import { Button } from '@svertik/ui';

  let { onclose }: { onclose: () => void } = $props();

  const groups: { title: string; keys: [string, string][] }[] = [
    {
      title: 'General',
      keys: [
        ['/  or  ⌘K', 'Command line: add an effect, or set, key, select, goto, export'],
        ['⌘O', 'Open project or import SVG'],
        ['⌘S', 'Save project'],
        ['⌘Z  /  ⇧⌘Z', 'Undo / redo'],
        ['?', 'This sheet'],
      ],
    },
    {
      title: 'Selection',
      keys: [
        ['⌘A', 'Select all'],
        ['⌘C  ⌘X  ⌘V', 'Copy, cut, paste'],
        ['⇧⌘V', 'Paste in place'],
        ['⌘D', 'Duplicate'],
        ['⌘G  /  ⇧⌘G', 'Group / ungroup'],
        ['Delete', 'Remove'],
        ['R', 'Randomize the selected effect'],
      ],
    },
    {
      title: 'Order',
      keys: [
        ['⌥↑  ⌥↓', 'Move up / down in the stack'],
        ['⌘]  ⌘[', 'Bring forward / send backward'],
        ['⇧⌘]  ⇧⌘[', 'Bring to front / send to back'],
      ],
    },
    {
      title: 'Canvas',
      keys: [
        ['V  or  Esc', 'Select tool'],
        ['Space + drag', 'Pan'],
        ['⇧1', 'Zoom to fit'],
        ['⇧0', 'Actual size'],
        ['Enter', 'Edit the selected text'],
      ],
    },
    {
      title: 'Stack',
      keys: [
        ['↑ ↓  Home  End', 'Move between rows'],
        ['← →', 'Collapse / expand'],
        ['F2', 'Rename'],
        ['Letters', 'Jump to a row by name'],
      ],
    },
    {
      title: 'Timeline',
      keys: [
        ['K', 'Key here: keyframe what is animated in the selection'],
        ['← →', 'Move the focused keyframe one frame'],
        ['Delete', 'Remove the focused keyframe'],
      ],
    },
  ];
</script>

<Dialog.Root open onOpenChange={(o) => !o && onclose()}>
  <Dialog.Portal>
    <Dialog.Overlay class="sv-dialog-overlay" />
    <Dialog.Content class="sv-dialog sv-shortcuts">
      <Dialog.Title class="sv-dialog-title">Keyboard shortcuts</Dialog.Title>
      <div class="grid">
        {#each groups as g (g.title)}
          <section>
            <h3>{g.title}</h3>
            <dl>
              {#each g.keys as [keys, what] (keys)}
                <dt><kbd>{keys}</kbd></dt>
                <dd>{what}</dd>
              {/each}
            </dl>
          </section>
        {/each}
      </div>
      <div class="actions">
        <Dialog.Close>
          {#snippet child({ props })}<Button {...props} kind="primary" label="Close" />{/snippet}
        </Dialog.Close>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.sv-dialog.sv-shortcuts) { width: min(720px, calc(100vw - 32px)); max-height: calc(100vh - 64px); overflow-y: auto; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--sv-space-12) var(--sv-space-16); margin: var(--sv-space-8) 0; }
  h3 { margin: 0 0 var(--sv-space-4); color: var(--sv-text-secondary); font-size: var(--sv-font-size-10); font-weight: var(--sv-font-weight-regular); }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: var(--sv-space-2) var(--sv-space-8); margin: 0; }
  dt { margin: 0; }
  dd { margin: 0; color: var(--sv-text-secondary); }
  kbd { font: inherit; color: var(--sv-text-primary); white-space: pre; }
  .actions { display: flex; justify-content: flex-end; }
</style>
