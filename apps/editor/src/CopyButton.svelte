<script lang="ts">
  interface Props { label: string; onclick: () => void; disabled?: boolean }
  let { label, onclick, disabled = false }: Props = $props();
</script>

<button class="copy" type="button" aria-label={label} title={label} {disabled} {onclick}>Copy</button>

<style>
  .copy {
    position: absolute;
    z-index: 5;
    top: var(--sv-space-8);
    right: var(--sv-space-8);
    height: 22px;
    padding: 0 var(--sv-space-8);
    color: var(--sv-text-primary);
    background: var(--sv-surface-panel);
    border: var(--sv-border-1) solid var(--sv-rule-strong);
    font: inherit;
    font-size: var(--sv-font-size-10);
    opacity: 0.3;
    cursor: pointer;
    transition: opacity 120ms ease;
  }
  .copy:hover, .copy:focus-visible { opacity: 1; }
  .copy:disabled { opacity: 0.15; cursor: default; }
</style>
