<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    /** id del control, para asociar la etiqueta. */
    for?: string;
    /** Fila que crece con su control (cuadros de texto), en vez de la altura fija de una línea. */
    tall?: boolean;
    children?: Snippet;
  }
  let { label, for: htmlFor, tall = false, children }: Props = $props();
</script>

<div class="sv-param" data-tall={tall || undefined}>
  <label for={htmlFor}>{label}</label>
  <div class="control">{@render children?.()}</div>
</div>

<style>
  .sv-param {
    display: flex;
    align-items: center;
    gap: var(--sv-space-8);
    height: var(--sv-size-row);
    padding: 0 var(--sv-space-8);
  }
  .sv-param[data-tall] { height: auto; align-items: flex-start; padding-top: var(--sv-space-4); padding-bottom: var(--sv-space-4); }
  .sv-param[data-tall] label { padding-top: var(--sv-space-2); }
  label {
    flex: none;
    width: 84px;
    text-align: right;
    color: var(--sv-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .control { flex: 1; display: flex; align-items: center; gap: var(--sv-space-8); min-width: 0; }
</style>
