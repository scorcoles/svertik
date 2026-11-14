<script lang="ts">
  import { onDestroy } from 'svelte';

  interface Props { label: string; onclick: () => void | boolean | Promise<void | boolean>; disabled?: boolean }
  let { label, onclick, disabled = false }: Props = $props();
  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function copy() {
    if (disabled) return;
    if (await onclick() === false) return;
    copied = true;
    clearTimeout(timer);
    timer = setTimeout(() => (copied = false), 2000);
  }

  onDestroy(() => clearTimeout(timer));
</script>

<button class="copy" type="button" aria-label={copied ? 'Copied' : label} title={copied ? 'Copied' : label} {disabled} onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>

<style>
  .copy {
    position: absolute;
    z-index: 5;
    top: var(--sv-space-8);
    right: var(--sv-space-8);
    height: 22px;
    width: 56px;
    padding: 0;
    box-sizing: border-box;
    color: var(--sv-text-primary);
    background: var(--sv-surface-panel);
    border: var(--sv-border-1) solid var(--sv-rule-strong);
    font: inherit;
    font-size: var(--sv-font-size-10);
    text-align: center;
    opacity: 0.3;
    cursor: pointer;
    transition: opacity 120ms ease;
  }
  .copy:hover, .copy:focus-visible { opacity: 1; }
  .copy:disabled { opacity: 0.15; cursor: default; }
</style>
