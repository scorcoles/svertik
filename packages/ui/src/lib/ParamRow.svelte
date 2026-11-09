<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    /** id del control, para asociar la etiqueta. */
    for?: string;
    children?: Snippet;
  }
  let { label, for: htmlFor, children }: Props = $props();
</script>

<div class="sv-param">
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
