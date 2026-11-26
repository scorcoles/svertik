<script lang="ts">
  import { t } from '@svertik/ui';
  import { completionsAt, signatureAt, type CompletionScope, type Completions, type Signature } from './formula-complete';

  // Suggestions for a formula field (the console's line, the formula editor's text): what can come at the caret.
  // ↑/↓ choose, Tab or Enter put it in, Escape closes. The list is drawn where this component is placed.
  let { field, scope, label }: { field: HTMLInputElement | HTMLTextAreaElement | undefined; scope: () => CompletionScope; label: string } = $props();
  let open = $state<Completions | null>(null);
  /** The call the caret is in, with the argument being written: parameter help. */
  let signature = $state<Signature | null>(null);
  function follow() {
    if (!field) return;
    const caret = field.selectionStart ?? field.value.length;
    signature = document.activeElement === field ? signatureAt(field.value.slice(0, caret), scope()) : null;
  }
  let active = $state(0);
  let list = $state<HTMLUListElement>();
  /** A note short enough to sit beside the name (a value); longer ones are descriptions, shown below the list. */
  const short = (detail: string | undefined) => !!detail && detail.length <= 12;

  function suggest() {
    if (!field) return;
    const caret = field.selectionStart ?? field.value.length;
    if (caret !== (field.selectionEnd ?? caret)) { open = null; return; }
    open = completionsAt(field.value.slice(0, caret), scope());
    active = 0;
  }
  function accept(i = active) {
    const item = open?.items[i];
    if (!field || !open || !item) return;
    const caret = field.selectionStart ?? field.value.length;
    field.value = field.value.slice(0, open.from) + item.insert + field.value.slice(caret);
    const at = open.from + item.insert.length;
    field.setSelectionRange(at, at);
    // As typing would: the field's owner takes the new text.
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
    // After `scene.` or `sin(`, what comes next.
    if (/[.(]$/.test(item.insert)) suggest(); else open = null;
    follow();
  }
  $effect(() => {
    const el = field;
    if (!el) return;
    const input = () => { suggest(); follow(); };
    // The caret moved (arrows, a click): the argument being written may have changed.
    const moved = () => follow();
    const key = (e: Event) => {
      const k = (e as KeyboardEvent).key;
      if (!open) {
        if (k === ' ' && (e as KeyboardEvent).ctrlKey) { e.preventDefault(); suggest(); }
        return;
      }
      const consume = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (k === 'ArrowDown') { consume(); active = (active + 1) % open.items.length; }
      else if (k === 'ArrowUp') { consume(); active = (active - 1 + open.items.length) % open.items.length; }
      else if (k === 'Tab' || k === 'Enter') { consume(); accept(); }
      else if (k === 'Escape') { consume(); open = null; }
      else if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Home' || k === 'End') open = null;
    };
    const blur = () => { open = null; signature = null; };
    el.addEventListener('input', input);
    el.addEventListener('keydown', key);
    el.addEventListener('keyup', moved);
    el.addEventListener('click', moved);
    el.addEventListener('focus', moved);
    el.addEventListener('blur', blur);
    return () => {
      el.removeEventListener('input', input); el.removeEventListener('keydown', key); el.removeEventListener('blur', blur);
      el.removeEventListener('keyup', moved); el.removeEventListener('click', moved); el.removeEventListener('focus', moved);
    };
  });
  $effect(() => { void active; list?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); });
</script>

{#if signature && !open}
  <div class="suggestions signature" role="status">
    <p class="call"><span class="name">{signature.name}</span>(<!--
      -->{#each signature.params as param, i}{#if i}, {/if}<span class:active={i === signature.active}>{param}</span>{/each})</p>
    {#if signature.about}<p class="about">{signature.about}</p>{/if}
  </div>
{/if}
{#if open}
  {@const current = open.items[active]}
  <div class="suggestions">
    <!-- Names on one line each (a short note, like a current value, beside it); the chosen one's description below. -->
    <ul role="listbox" aria-label={t('Suggestions for {name}', { name: label })} bind:this={list}>
      {#each open.items as item, i (item.label)}
        <li role="option" aria-selected={i === active}>
          <button type="button" tabindex="-1" onpointerdown={(e) => { e.preventDefault(); accept(i); }}>
            <span class="name">{item.label}</span>{#if short(item.detail)}<span class="value">{item.detail}</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
    {#if current?.detail && !short(current.detail)}<p class="about">{current.detail}</p>{/if}
  </div>
{/if}

<style>
  .suggestions { box-sizing: border-box; width: 100%; margin-top: 2px; background: var(--sv-surface-panel); border: 1px solid var(--sv-rule-strong); font-family: var(--sv-font-mono); font-size: inherit; }
  ul { max-height: 160px; overflow: auto; margin: 0; padding: 2px 0; list-style: none; }
  button { display: flex; gap: 12px; align-items: baseline; justify-content: space-between; width: 100%; padding: 1px 8px; color: var(--sv-text-primary); background: none; border: 0; border-radius: 0; font: inherit; text-align: left; cursor: pointer; }
  li[aria-selected='true'] button { background: var(--sv-accent-selection); }
  .name { min-width: 0; overflow: hidden; color: var(--sv-code-property); text-overflow: ellipsis; white-space: nowrap; }
  .value { flex: none; color: var(--sv-code-number); }
  .call { margin: 0; padding: 4px 8px; color: var(--sv-text-muted); white-space: normal; overflow-wrap: anywhere; }
  .call .active { color: var(--sv-text-primary); font-weight: var(--sv-font-weight-bold, 700); text-decoration: underline; text-underline-offset: 3px; }
  .about { margin: 0; padding: 4px 8px 5px; color: var(--sv-text-secondary); line-height: 1.45; white-space: normal; overflow-wrap: anywhere; border-top: 1px solid var(--sv-rule-default); }
</style>
