<script lang="ts">
  import { t } from '@svertik/ui';
  // A project that keeps its SVGs outside: which files it needs, to choose them (or drop them on the canvas).
  import { AlertDialog } from 'bits-ui';
  import { Button } from '@svertik/ui';

  interface Props {
    files: string[];
    onfiles: (files: File[]) => void;
    onclose: () => void;
  }
  let { files, onfiles, onclose }: Props = $props();
  let input: HTMLInputElement;
</script>

<AlertDialog.Root open onOpenChange={(o) => !o && onclose()}>
  <AlertDialog.Portal>
    <AlertDialog.Overlay class="sv-dialog-overlay" />
    <AlertDialog.Content class="sv-dialog">
      <AlertDialog.Title class="sv-dialog-title">
        {files.length === 1 ? t('This project needs 1 SVG') : t('This project needs {count} SVGs', { count: files.length })}
      </AlertDialog.Title>
      <AlertDialog.Description class="sv-dialog-text">
        {t('It was saved without embedding them. Choose these files, or drop them on the canvas; until then their objects draw nothing.')}
      </AlertDialog.Description>
      <ul class="files">
        {#each files as file (file)}<li>{file}</li>{/each}
      </ul>
      <div class="actions">
        <span class="spacer"></span>
        <AlertDialog.Cancel>
          {#snippet child({ props })}<Button {...props} label={t('Later')} />{/snippet}
        </AlertDialog.Cancel>
        <Button kind="primary" label={t('Choose SVGs…')} onclick={() => input.click()} />
      </div>
      <input
        bind:this={input}
        type="file"
        accept=".svg,image/svg+xml"
        multiple
        hidden
        onchange={() => {
          const picked = Array.from(input.files ?? []);
          input.value = '';
          if (picked.length) onfiles(picked);
        }}
      />
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>

<style>
  .files {
    margin: 0 0 var(--sv-space-16);
    padding: 0;
    list-style: none;
    max-height: 160px;
    overflow: auto;
  }
  .files li { padding: var(--sv-space-2) 0; overflow-wrap: anywhere; }
  .actions { display: flex; gap: var(--sv-space-8); }
  .spacer { flex: 1; }
</style>
