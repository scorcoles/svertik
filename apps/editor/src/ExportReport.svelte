<script lang="ts">
  // Lo que dice una exportación: qué se ha guardado, cuánto pesa y lo que no ha podido ir.
  import { AlertDialog } from 'bits-ui';
  import { Button } from '@svertik/ui';

  interface Props {
    title: string;
    summary: string;
    warnings: string[];
    onclose: () => void;
  }
  let { title, summary, warnings, onclose }: Props = $props();
</script>

<AlertDialog.Root open onOpenChange={(o) => !o && onclose()}>
  <AlertDialog.Portal>
    <AlertDialog.Overlay class="sv-dialog-overlay" />
    <AlertDialog.Content class="sv-dialog">
      <AlertDialog.Title class="sv-dialog-title">{title}</AlertDialog.Title>
      <AlertDialog.Description class="sv-dialog-text">{summary}</AlertDialog.Description>
      {#if warnings.length}
        <ul class="warnings">
          {#each warnings as w (w)}<li>{w}</li>{/each}
        </ul>
      {/if}
      <div class="actions">
        <AlertDialog.Action>
          {#snippet child({ props })}<Button {...props} kind="primary" label="OK" onclick={onclose} />{/snippet}
        </AlertDialog.Action>
      </div>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>

<style>
  .warnings { margin: 0 0 var(--sv-space-16); padding-left: var(--sv-space-16); color: var(--sv-signal-warning, #ffd166); font-size: var(--sv-font-size-10); line-height: 1.5; }
  .warnings li + li { margin-top: var(--sv-space-4); }
  .actions { display: flex; justify-content: flex-end; }
</style>
