<script lang="ts">
  import { t } from '@svertik/ui';
  let { text, label = t('More information'), visible = true }: { text: string; label?: string; visible?: boolean } = $props();
  let open = $state(false);
</script>

{#if visible}<span class="info-tip" role="group" aria-label={label} onpointerenter={() => (open = true)} onpointerleave={() => (open = false)} onfocusin={() => (open = true)} onfocusout={(event) => {
  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) open = false;
}}>
  <button class="trigger" type="button" aria-label={label} aria-expanded={open} title={label} onclick={() => (open = !open)}>i</button>
  {#if open}<span class="popup" role="tooltip">{text}</span>{/if}
</span>{/if}

<style>
  .info-tip { position: relative; display: inline-flex; flex: none; vertical-align: middle; }
  .trigger { display: inline-grid; place-items: center; width: 12px; height: 12px; padding: 0; color: var(--sv-text-secondary); opacity: .5; background: transparent; border: 1px solid currentColor; border-radius: 50%; font: inherit; font-size: 8px; font-weight: 600; line-height: 1; cursor: help; }
  .trigger:hover, .trigger:focus-visible { color: var(--sv-accent-text); opacity: 1; outline: none; }
  .popup { position: absolute; z-index: 1000; top: calc(100% + 6px); left: -4px; width: max-content; max-width: min(300px, 70vw); padding: 8px 10px; color: var(--sv-text-primary); background: var(--sv-surface-panel); border: 1px solid var(--sv-rule-strong); box-shadow: 0 4px 14px rgb(0 0 0 / 28%); font-size: var(--sv-font-size-11); font-weight: 400; line-height: 1.45; white-space: normal; text-align: left; }
</style>
