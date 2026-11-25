<script lang="ts">
  import { t } from '@svertik/ui';
  import { IconButton } from '@svertik/ui';
  import type { Editor } from './editor.svelte';
  import TextZoom from './TextZoom.svelte';
  import CopyButton from './CopyButton.svelte';

  let { editor, maximized, onmaximize, onclose, oncopy }: { editor: Editor; maximized: boolean; onmaximize: () => void; onclose: () => void; oncopy: (text: string, what: string) => void } = $props();
</script>

<section class="notes" aria-labelledby="notes-title">
  <header>
    <h2 id="notes-title">{t('Scene notes')}</h2>
    <TextZoom value={editor.textZoom} onchange={(v) => editor.setTextZoom(v)} />
    <IconButton icon={maximized ? 'restore' : 'maximize'} label={maximized ? t('Restore editor layout') : t('Use all available space for notes')} aria-pressed={maximized} onclick={onmaximize} />
    <IconButton icon="down" label={t('Close notes panel')} onclick={onclose} />
  </header>
  <div class="note-editor">
    <textarea class="sv-writing-theme" data-sv-theme="dark"
      aria-label={t('Scene notes')}
      placeholder={t('What should happen to this scene? What should an agent know?')}
      value={editor.scene?.notes ?? ''}
      style:font-size={`${11 * editor.textZoom / 100}px`}
      oninput={(e) => editor.setNotes(e.currentTarget.value)}
    ></textarea>
    <CopyButton label={t('Copy notes')} disabled={!editor.scene?.notes} onclick={() => oncopy(editor.scene?.notes ?? '', t('Notes'))} />
  </div>
  <p>{t('Notes for an agent working on this scene. They are saved with the project and do not appear in the artwork.')}</p>
</section>

<style>
  .notes {
    display: flex;
    flex-direction: column;
    gap: var(--sv-space-6);
    min-height: 0;
    padding: var(--sv-space-8);
    color: var(--sv-text-primary);
    background: var(--sv-surface-panel);
    border-top: var(--sv-border-1) solid var(--sv-rule-default);
    font-family: var(--sv-font-mono);
    font-size: var(--sv-font-size-11);
  }
  header { display: flex; align-items: center; gap: var(--sv-space-8); }
  h2 { flex: 1; margin: 0; font-size: var(--sv-font-size-11); }
  .note-editor { position: relative; flex: 1; min-height: 40px; }
  .note-editor:hover :global(.copy) { opacity: 1; }
  textarea {
    flex: 1;
    min-height: 40px;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    resize: none;
    padding: var(--sv-space-6);
    color: var(--sv-text-primary);
    background: var(--sv-surface-field);
    border: var(--sv-border-1) solid var(--sv-rule-default);
    outline: none;
    font: inherit;
    line-height: 1.5;
  }
  textarea:focus { border-color: var(--sv-accent-fill); }
  textarea::placeholder, p { color: var(--sv-text-muted); }
  p { flex: none; margin: 0; line-height: 1.4; }
</style>
