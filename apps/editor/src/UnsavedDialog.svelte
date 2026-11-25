<script lang="ts">
  import { t } from '@svertik/ui';
  // Before changing file with unsaved changes: save, discard or stay.
  import { AlertDialog } from 'bits-ui';
  import { Button } from '@svertik/ui';

  interface Props {
    name: string;
    onsave: () => void;
    ondiscard: () => void;
    oncancel: () => void;
  }
  let { name, onsave, ondiscard, oncancel }: Props = $props();
</script>

<AlertDialog.Root open onOpenChange={(o) => !o && oncancel()}>
  <AlertDialog.Portal>
    <AlertDialog.Overlay class="sv-dialog-overlay" />
    <AlertDialog.Content class="sv-dialog">
      <AlertDialog.Title class="sv-dialog-title">{t('Save changes to “{name}”?', { name })}</AlertDialog.Title>
      <AlertDialog.Description class="sv-dialog-text">{t('If you don’t save, your changes will be lost.')}</AlertDialog.Description>
      <div class="actions">
        <Button label={t('Don’t save')} onclick={ondiscard} />
        <span class="spacer"></span>
        <AlertDialog.Cancel>
          {#snippet child({ props })}<Button {...props} label={t('Cancel')} />{/snippet}
        </AlertDialog.Cancel>
        <Button kind="primary" label={t('Save')} onclick={onsave} />
      </div>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>

<style>
  :global(.sv-dialog-overlay) { position: fixed; inset: 0; z-index: 90; background: var(--sv-overlay-ink); }
  :global(.sv-dialog) {
    position: fixed;
    z-index: 91;
    top: 50%;
    left: 50%;
    translate: -50% -50%;
    width: min(380px, calc(100vw - 32px));
    padding: var(--sv-space-16);
    font-family: var(--sv-font-mono);
    font-size: var(--sv-font-size-11);
    color: var(--sv-text-primary);
    background: var(--sv-surface-raised);
    border: var(--sv-border-1) solid var(--sv-rule-strong);
  }
  :global(.sv-dialog-title) { margin: 0 0 var(--sv-space-8); font-size: var(--sv-font-size-12); font-weight: var(--sv-font-weight-bold); }
  :global(.sv-dialog-text) { margin: 0 0 var(--sv-space-16); color: var(--sv-text-secondary); }
  .actions { display: flex; gap: var(--sv-space-8); }
  .spacer { flex: 1; }
</style>
